import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to normalize service names for better duplicate detection
function normalizeServiceName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // Remove non-alphanumeric characters
    .replace(/\b(inc|llc|ltd|corp|co|company|limited|incorporated)\b/g, '') // Remove company suffixes
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function analyzeEmailWithGemini(emailText: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `
You are a specialized AI system designed to analyze emails and identify subscription services and recurring payments.

Analyze the following email content to determine if it relates to a subscription service or recurring payment.
Look for indicators such as:
- Regular payment mentions (monthly, annually, quarterly, weekly, etc.)
- Subscription confirmation, renewal, or billing notices
- Receipts for recurring services
- Trial period information
- Account or membership information
- Payment confirmations for services
- Billing statements
- Service confirmations
- Any email that mentions a service with recurring payments

IMPORTANT: Be inclusive rather than exclusive. If there's any indication of a recurring service or subscription, mark it as a subscription.

If this email is about a subscription or recurring service, extract the following details:
- Service name: The name of the subscription service (extract from sender, subject, or content)
- Price: The amount charged (look for any monetary amounts)
- Currency: USD, EUR, etc.
- Billing frequency: monthly, yearly, quarterly, weekly, etc.
- Next billing date: When the next payment will occur (in YYYY-MM-DD format if possible)
- Service provider: The company name providing the service

FORMAT YOUR RESPONSE AS A JSON OBJECT with the following structure:

For subscription/recurring service emails:
{
  "is_subscription": true,
  "subscription_name": "The service name (extract from any available information)",
  "price": 19.99,
  "currency": "USD",
  "billing_cycle": "monthly", 
  "next_billing_date": "YYYY-MM-DD",
  "service_provider": "The company name",
  "confidence_score": 0.95
}

For non-subscription emails:
{
  "is_subscription": false,
  "confidence_score": 0.95
}

IMPORTANT GUIDELINES: 
- Always return valid JSON
- Use null for missing dates
- Ensure price is a number, not a string
- Use standard currency codes (USD, EUR, GBP, etc.)
- Use standard billing cycles (monthly, yearly, quarterly, weekly, etc.)
- If you can identify a service but not the exact name, use the sender domain or company name
- If you can't find a specific price, use 0 but still mark as subscription if it's clearly a service
- Be generous in identifying subscriptions - better to include than exclude
- Look at sender email addresses, subject lines, and content for service identification

Email:
"""
${emailText}
"""
`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { 
      response_mime_type: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1000
    }
  };

  // Implement retry logic with exponential backoff for rate limiting
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Edge Function: Gemini API attempt ${attempt}/${maxRetries}`);
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        console.error(`Edge Function: Gemini API error (attempt ${attempt}): ${response.status} ${response.statusText}`);
        
        // If we hit rate limits, implement exponential backoff
        if (response.status === 429) {
          // Check if it's quota exhaustion
          try {
            const errorData = await response.json();
            if (errorData.error && errorData.error.status === 'RESOURCE_EXHAUSTED') {
              console.log('Edge Function: Gemini API quota exhausted, stopping retries');
              return { error: `Quota exhausted after ${attempt} attempts`, is_subscription: false };
            }
          } catch (parseError) {
            // If we can't parse the error, assume it's a rate limit
          }
          
          lastError = new Error(`Gemini API rate limit hit (attempt ${attempt})`);
          
          if (attempt < maxRetries) {
            const backoffDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`Edge Function: Rate limit hit, backing off for ${backoffDelay}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue; // Try again
          } else {
            console.log('Edge Function: Max retries reached for rate limiting');
            return { error: `Rate limit exceeded after ${maxRetries} attempts`, is_subscription: false };
          }
        }
        
        // For other errors, throw immediately
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      
      if (!text) {
        console.error("Edge Function: No response text from Gemini API");
        if (attempt < maxRetries) {
          console.log(`Edge Function: Empty response, retrying (attempt ${attempt + 1})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          return { error: "No response from Gemini API", is_subscription: false };
        }
      }

      // Try to extract JSON from the response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error("Edge Function: No JSON found in Gemini response:", text);
          if (attempt < maxRetries) {
            console.log(`Edge Function: Invalid JSON format, retrying (attempt ${attempt + 1})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            return { error: "No JSON found in response", is_subscription: false };
          }
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        // Validate the result structure
        if (typeof result.is_subscription !== 'boolean') {
          console.error("Edge Function: Invalid result structure - missing is_subscription:", result);
          if (attempt < maxRetries) {
            console.log(`Edge Function: Invalid result structure, retrying (attempt ${attempt + 1})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            return { error: "Invalid result structure", is_subscription: false };
          }
        }
        
        // Validate subscription data if it's a subscription
        if (result.is_subscription) {
          // If subscription_name is missing, try to extract it from the email content
          if (!result.subscription_name || typeof result.subscription_name !== 'string') {
            console.log("Edge Function: Subscription name missing, attempting to extract from email content");
            // Try to extract service name from email content or use a fallback
            const emailLower = emailText.toLowerCase();
            let extractedName: string | null = null;
            
            // Look for common service indicators in the email
            if (emailLower.includes('netflix') || emailLower.includes('nflx')) extractedName = 'Netflix';
            else if (emailLower.includes('spotify')) extractedName = 'Spotify';
            else if (emailLower.includes('amazon') || emailLower.includes('prime')) extractedName = 'Amazon Prime';
            else if (emailLower.includes('disney') || emailLower.includes('disney+')) extractedName = 'Disney+';
            else if (emailLower.includes('hbo') || emailLower.includes('max')) extractedName = 'HBO Max';
            else if (emailLower.includes('youtube') || emailLower.includes('yt premium')) extractedName = 'YouTube Premium';
            else if (emailLower.includes('apple')) extractedName = 'Apple Services';
            else if (emailLower.includes('hulu')) extractedName = 'Hulu';
            else if (emailLower.includes('paramount') || emailLower.includes('paramount+')) extractedName = 'Paramount+';
            else if (emailLower.includes('peacock')) extractedName = 'Peacock';
            else if (emailLower.includes('adobe')) extractedName = 'Adobe Creative Cloud';
            else if (emailLower.includes('microsoft') || emailLower.includes('office 365')) extractedName = 'Microsoft 365';
            else if (emailLower.includes('google one') || emailLower.includes('drive storage')) extractedName = 'Google One';
            else if (emailLower.includes('dropbox')) extractedName = 'Dropbox';
            else if (emailLower.includes('nba') || emailLower.includes('league pass')) extractedName = 'NBA League Pass';
            else if (emailLower.includes('babbel')) extractedName = 'Babbel';
            else if (emailLower.includes('chegg')) extractedName = 'Chegg';
            else if (emailLower.includes('grammarly')) extractedName = 'Grammarly';
            else if (emailLower.includes('nordvpn') || emailLower.includes('vpn')) extractedName = 'NordVPN';
            else if (emailLower.includes('peloton')) extractedName = 'Peloton';
            else if (emailLower.includes('duolingo')) extractedName = 'Duolingo';
            else if (emailLower.includes('notion')) extractedName = 'Notion';
            else if (emailLower.includes('canva')) extractedName = 'Canva';
            else if (emailLower.includes('nytimes') || emailLower.includes('ny times')) extractedName = 'New York Times';
            else if (emailLower.includes('vercel')) extractedName = 'Vercel';
            
            if (extractedName) {
              result.subscription_name = extractedName;
              console.log(`Edge Function: Extracted subscription name: ${extractedName}`);
            } else {
              // If we still can't find a name, use a generic name but still process it
              result.subscription_name = 'Unknown Service';
              console.log("Edge Function: Using generic name 'Unknown Service' for subscription");
            }
          }
          
          // Ensure price is a number
          if (result.price !== undefined && typeof result.price !== 'number') {
            result.price = parseFloat(result.price) || 0;
          }
          
          // Ensure confidence_score is a number
          if (result.confidence_score !== undefined && typeof result.confidence_score !== 'number') {
            result.confidence_score = parseFloat(result.confidence_score) || 0.8;
          }
        }
        
        return result;
      } catch (parseError) {
        console.error(`Edge Function: Failed to parse Gemini JSON response (attempt ${attempt}):`, parseError);
        console.error("Edge Function: Raw response text:", text);
        
        if (attempt < maxRetries) {
          console.log(`Edge Function: JSON parse error, retrying (attempt ${attempt + 1})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          return { error: "Failed to parse JSON response", is_subscription: false };
        }
      }
      
    } catch (error) {
      console.error(`Edge Function: Error calling Gemini API (attempt ${attempt}):`, error);
      lastError = error;
      
      if (attempt < maxRetries) {
        const retryDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Edge Function: API error, retrying in ${retryDelay}ms (attempt ${attempt + 1})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.log('Edge Function: Max retries reached');
        break;
      }
    }
  }
  
  // If we get here, all retries failed
  console.log('Edge Function: All Gemini API attempts failed');
  console.log('Edge Function: Last error:', lastError?.message);
  return { error: "API call failed after all retries", is_subscription: false };
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Find all scans ready for analysis
    const { data: scans, error: scanError } = await supabase
      .from("scan_history")
      .select("*")
      .eq("status", "ready_for_analysis");

    if (scanError) {
      console.error("Failed to fetch scans:", scanError);
      return new Response(JSON.stringify({ error: "Failed to fetch scans", details: scanError }), { status: 500 });
    }

    if (!scans || scans.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No scans ready for analysis" }), { status: 200 });
    }

    console.log(`Processing ${scans.length} scans ready for analysis`);

    for (const scan of scans) {
      console.log(`Processing scan ${scan.scan_id} for user ${scan.user_id}`);
      
      // 2. Get pre-identified potential subscriptions for this scan
      const { data: potentialSubscriptions, error: subscriptionError } = await supabase
        .from("subscription_analysis")
        .select("*")
        .eq("scan_id", scan.scan_id)
        .eq("analysis_status", "pending");

      if (subscriptionError) {
        console.error(`Failed to fetch potential subscriptions for scan ${scan.scan_id}:`, subscriptionError);
        await supabase.from("scan_history").update({ 
          status: "error", 
          error_message: subscriptionError.message 
        }).eq("id", scan.id);
        continue;
      }

      if (!potentialSubscriptions || potentialSubscriptions.length === 0) {
        console.log(`No potential subscriptions found for scan ${scan.scan_id}`);
        await supabase.from("scan_history").update({ 
          status: "completed", 
          completed_at: new Date().toISOString() 
        }).eq("id", scan.id);
        continue;
      }

      console.log(`Analyzing ${potentialSubscriptions.length} potential subscriptions with Gemini for scan ${scan.scan_id}`);

      // 3. Analyze each potential subscription with Gemini
      let processedCount = 0;
      for (const analysis of potentialSubscriptions) {
        console.log(`Analyzing potential subscription: ${analysis.subscription_name} for email ${analysis.email_data_id}`);
        
        // Get the email content for Gemini analysis
        const { data: emailData, error: emailError } = await supabase
          .from("email_data")
          .select("content, subject, sender, gmail_message_id")
          .eq("id", analysis.email_data_id)
          .single();

        if (emailError || !emailData) {
          console.error(`Failed to fetch email data for analysis ${analysis.id}:`, emailError);
          continue;
        }

        // Prepare email content for Gemini
        const emailContent = `
Subject: ${emailData.subject}
From: ${emailData.sender}
Content: ${emailData.content}
        `.trim();
        
        // Add a delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between calls
        
        const geminiResult = await analyzeEmailWithGemini(emailContent);
        
        console.log(`Gemini result for analysis ${analysis.id}:`, {
          is_subscription: geminiResult.is_subscription,
          subscription_name: geminiResult.subscription_name,
          price: geminiResult.price,
          error: geminiResult.error
        });

        // Check for errors in Gemini analysis
        if (geminiResult.error) {
          console.error(`Gemini analysis error for analysis ${analysis.id}:`, geminiResult.error);
          // Update analysis status to failed
          await supabase.from("subscription_analysis").update({
            analysis_status: 'failed',
            gemini_response: JSON.stringify({ error: geminiResult.error }),
            updated_at: new Date().toISOString()
          }).eq("id", analysis.id);
          continue;
        }

        // Update the analysis record with Gemini results
        const { error: updateError } = await supabase.from("subscription_analysis").update({
          subscription_name: geminiResult.subscription_name || analysis.subscription_name,
          price: geminiResult.price || analysis.price,
          currency: geminiResult.currency || analysis.currency,
          billing_cycle: geminiResult.billing_cycle || analysis.billing_cycle,
          next_billing_date: geminiResult.next_billing_date,
          service_provider: geminiResult.service_provider || analysis.service_provider,
          confidence_score: geminiResult.confidence_score || analysis.confidence_score,
          analysis_status: 'completed',
          gemini_response: JSON.stringify(geminiResult),
          updated_at: new Date().toISOString()
        }).eq("id", analysis.id);

        if (updateError) {
          console.error(`Failed to update analysis record ${analysis.id}:`, updateError);
          continue;
        }

        // Only create subscription if Gemini confirms it's a subscription
        if (geminiResult && geminiResult.is_subscription && geminiResult.subscription_name) {
          console.log(`Gemini confirmed subscription: ${geminiResult.subscription_name}`);
          
          // Check for duplicates before creating subscription
          const normalizedServiceName = normalizeServiceName(geminiResult.subscription_name);
          console.log(`Normalized service name: "${geminiResult.subscription_name}" -> "${normalizedServiceName}"`);
          
          // Check if subscription already exists
          const { data: existingSubscriptions, error: checkError } = await supabase
            .from("subscriptions")
            .select("name")
            .eq("user_id", scan.user_id)
            .ilike("name", `%${normalizedServiceName}%`);
          
          if (checkError) {
            console.error(`Error checking for existing subscriptions:`, checkError);
          } else if (existingSubscriptions && existingSubscriptions.length > 0) {
            console.log(`Subscription "${geminiResult.subscription_name}" (normalized: "${normalizedServiceName}") already exists, skipping`);
            console.log(`Existing subscriptions found:`, existingSubscriptions.map(s => s.name));
            continue;
          }
          
          // Create subscription record
          const { error: subscriptionError } = await supabase.from("subscriptions").insert({
            user_id: scan.user_id,
            name: geminiResult.subscription_name,
            price: geminiResult.price || 0,
            currency: geminiResult.currency || 'USD',
            billing_cycle: geminiResult.billing_cycle || 'monthly',
            next_billing_date: geminiResult.next_billing_date,
            provider: geminiResult.service_provider,
            category: 'auto-detected',
            email_id: emailData.gmail_message_id,
            is_manual: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

          if (subscriptionError) {
            console.error(`Failed to insert subscription for analysis ${analysis.id}:`, subscriptionError);
            continue;
          }

          console.log(`Successfully created subscription: ${geminiResult.subscription_name}`);
          processedCount++;
        } else {
          console.log(`Gemini determined this is not a subscription: ${analysis.subscription_name}`);
          // Update analysis status to indicate it's not a subscription
          await supabase.from("subscription_analysis").update({
            analysis_status: 'not_subscription',
            gemini_response: JSON.stringify(geminiResult),
            updated_at: new Date().toISOString()
          }).eq("id", analysis.id);
        }
      }

      // 4. Mark scan as completed
      await supabase.from("scan_history").update({ 
        status: "completed", 
        completed_at: new Date().toISOString() 
      }).eq("id", scan.id);
      
      console.log(`Completed processing scan ${scan.scan_id} - Created ${processedCount} subscriptions`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Processed ${scans.length} scans successfully` 
    }), { status: 200 });
    
  } catch (error) {
    console.error("Unexpected error in Gemini scan:", error);
    return new Response(JSON.stringify({ 
      error: "Unexpected error", 
      details: error.message 
    }), { status: 500 });
  }
}); 