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

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status} ${response.statusText}`);
      return { error: `Gemini API error: ${response.status}`, is_subscription: false };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    if (!text) {
      console.error("No response text from Gemini API");
      return { error: "No response from Gemini API", is_subscription: false };
    }

    // Try to extract JSON from the response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in Gemini response:", text);
        return { error: "No JSON found in response", is_subscription: false };
      }
      
      const result = JSON.parse(jsonMatch[0]);
      
      // Validate the result structure
      if (typeof result.is_subscription !== 'boolean') {
        console.error("Invalid result structure - missing is_subscription:", result);
        return { error: "Invalid result structure", is_subscription: false };
      }
      
      // Validate subscription data if it's a subscription
      if (result.is_subscription) {
        // If subscription_name is missing, try to extract it from the email content
        if (!result.subscription_name || typeof result.subscription_name !== 'string') {
          console.log("Subscription name missing, attempting to extract from email content");
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
            console.log(`Extracted subscription name: ${extractedName}`);
          } else {
            // If we still can't find a name, use a generic name but still process it
            result.subscription_name = 'Unknown Service';
            console.log("Using generic name 'Unknown Service' for subscription");
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
      console.error("Failed to parse Gemini JSON response:", parseError);
      console.error("Raw response text:", text);
      return { error: "Failed to parse JSON response", is_subscription: false };
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return { error: "API call failed", is_subscription: false };
  }
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
      
      // 2. Get emails for this scan
      const { data: emails, error: emailError } = await supabase
        .from("email_data")
        .select("*")
        .eq("scan_id", scan.scan_id);

      if (emailError) {
        console.error(`Failed to fetch emails for scan ${scan.scan_id}:`, emailError);
        await supabase.from("scan_history").update({ 
          status: "error", 
          error_message: emailError.message 
        }).eq("id", scan.id);
        continue;
      }

      if (!emails || emails.length === 0) {
        console.log(`No emails found for scan ${scan.scan_id}`);
        await supabase.from("scan_history").update({ 
          status: "completed", 
          completed_at: new Date().toISOString() 
        }).eq("id", scan.id);
        continue;
      }

      console.log(`Analyzing ${emails.length} emails for scan ${scan.scan_id}`);

      // 3. Analyze each email with Gemini
      for (const email of emails) {
        console.log(`Analyzing email ${email.id} with subject: ${email.subject}`);
        
        const geminiResult = await analyzeEmailWithGemini(email.content || "");
        
        console.log(`Gemini result for email ${email.id}:`, {
          is_subscription: geminiResult.is_subscription,
          subscription_name: geminiResult.subscription_name,
          price: geminiResult.price,
          error: geminiResult.error
        });

        // Check for errors in Gemini analysis
        if (geminiResult.error) {
          console.error(`Gemini analysis error for email ${email.id}:`, geminiResult.error);
          continue;
        }

        // Only process if it's actually a subscription
        if (geminiResult && geminiResult.is_subscription && geminiResult.subscription_name) {
          console.log(`Found subscription: ${geminiResult.subscription_name} for email ${email.id}`);
          
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
          
          // 4. Store the result in subscription_analysis
          const { error: analysisError } = await supabase.from("subscription_analysis").insert({
            email_data_id: email.id,
            user_id: scan.user_id,
            scan_id: scan.scan_id,
            subscription_name: geminiResult.subscription_name,
            price: geminiResult.price || 0,
            currency: geminiResult.currency || 'USD',
            billing_cycle: geminiResult.billing_cycle || 'monthly',
            next_billing_date: geminiResult.next_billing_date,
            service_provider: geminiResult.service_provider,
            confidence_score: geminiResult.confidence_score || 0.8,
            analysis_status: 'completed',
            gemini_response: JSON.stringify(geminiResult),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

          if (analysisError) {
            console.error(`Failed to insert subscription analysis for email ${email.id}:`, analysisError);
            continue;
          }

          // 5. Insert into subscriptions table (using correct column names)
          const { error: subscriptionError } = await supabase.from("subscriptions").insert({
            user_id: scan.user_id,
            name: geminiResult.subscription_name,
            price: geminiResult.price || 0,
            currency: geminiResult.currency || 'USD',
            billing_cycle: geminiResult.billing_cycle || 'monthly',
            next_billing_date: geminiResult.next_billing_date,
            provider: geminiResult.service_provider, // Use 'provider' instead of 'service_provider'
            category: 'auto-detected',
            email_id: email.gmail_message_id,
            is_manual: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

          if (subscriptionError) {
            console.error(`Failed to insert subscription for email ${email.id}:`, subscriptionError);
            continue;
          }

          console.log(`Successfully processed subscription: ${geminiResult.subscription_name}`);
        } else {
          console.log(`Email ${email.id} is not a subscription or missing required data`);
        }
      }

      // 6. Mark scan as completed
      await supabase.from("scan_history").update({ 
        status: "completed", 
        completed_at: new Date().toISOString() 
      }).eq("id", scan.id);
      
      console.log(`Completed processing scan ${scan.scan_id}`);
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