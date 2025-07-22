import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeServiceName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|co|company|limited|incorporated)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

let requestCount = 0;
let lastQuotaReset = Date.now();

function checkQuota(): boolean {
  const now = Date.now();
  if (now - lastQuotaReset > 60000) {
    requestCount = 0;
    lastQuotaReset = now;
  }
  
  if (requestCount >= 60) {
    return false;
  }
  
  requestCount++;
  return true;
}

// Improved batch analysis function with better prompt and error handling
async function analyzeEmailsBatchWithGemini(emails: Array<{id: string, content: string, subject: string, sender: string}>) {
  if (!checkQuota()) {
    return { error: "Rate limit reached", results: [] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  // Build a clearer, more structured prompt
  const emailList = emails.map((email, index) => 
    `EMAIL ${index + 1}:
Subject: ${email.subject}
From: ${email.sender}
Content: ${email.content.substring(0, 1000)}`
  ).join('\n\n');

  const prompt = `Analyze these emails for subscription services. Look for:
- Recurring payments
- Billing notices
- Subscription confirmations
- Service renewals
- Payment receipts

For each email, return a JSON object with these exact fields:
{
  "is_subscription": true/false,
  "subscription_name": "service name or null",
  "price": number or null,
  "currency": "USD/EUR/etc or null",
  "billing_cycle": "monthly/yearly/weekly or null",
  "next_billing_date": "YYYY-MM-DD or null",
  "service_provider": "company name or null",
  "confidence_score": number between 0.0 and 1.0
}

Return a JSON array with one object per email in the same order. For non-subscriptions, set is_subscription to false and confidence_score to 0.95.

Emails to analyze:
${emailList}

Return ONLY the JSON array, no other text:`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { 
      response_mime_type: "application/json",
      temperature: 0.1,
      maxOutputTokens: 3000
    }
  };

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Sending batch of ${emails.length} emails to Gemini`);
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        if (response.status === 429) {
          try {
            const errorData = await response.json();
            if (errorData.error && errorData.error.status === 'RESOURCE_EXHAUSTED') {
              return { error: `Quota exhausted`, results: [], quota_exhausted: true };
            }
          } catch (parseError) {}
          
          lastError = new Error(`Rate limit hit`);
          
          if (attempt < maxRetries) {
            const backoffDelay = Math.pow(2, attempt) * 5000;
            console.log(`Rate limited, waiting ${backoffDelay}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          } else {
            return { error: `Rate limit exceeded`, results: [] };
          }
        }
        
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      
      if (!text) {
        console.log(`Attempt ${attempt}: No response text from Gemini`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          return { error: "No response", results: [] };
        }
      }

      console.log(`Attempt ${attempt}: Raw Gemini response (first 500 chars): ${text.substring(0, 500)}...`);

      try {
        // Try to extract JSON array from the response
        let jsonText = text.trim();
        
        // Remove any markdown formatting
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.substring(7);
        }
        if (jsonText.endsWith('```')) {
          jsonText = jsonText.substring(0, jsonText.length - 3);
      }

        // Find JSON array
        const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.log(`Attempt ${attempt}: No JSON array found in response. Full response: ${text}`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            return { error: "No JSON array found", results: [] };
          }
        }
        
        const results = JSON.parse(jsonMatch[0]);
        console.log(`Attempt ${attempt}: Parsed JSON array with ${results.length} results`);
        
        if (!Array.isArray(results)) {
          console.log(`Attempt ${attempt}: Response is not an array`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            return { error: "Response is not an array", results: [] };
          }
        }
        
        if (results.length !== emails.length) {
          console.log(`Attempt ${attempt}: Expected ${emails.length} results, got ${results.length}`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            return { error: `Expected ${emails.length} results, got ${results.length}`, results: [] };
          }
        }
        
        // Validate and process each result
        const processedResults = results.map((result, index) => {
          console.log(`Processing result ${index + 1}:`, result);
          
          // Ensure is_subscription is boolean
          if (typeof result.is_subscription !== 'boolean') {
            console.log(`Result ${index + 1}: Invalid is_subscription type, defaulting to false`);
            result.is_subscription = false;
        }
        
        if (result.is_subscription) {
            // Validate subscription fields
          if (!result.subscription_name || typeof result.subscription_name !== 'string') {
              console.log(`Result ${index + 1}: Missing subscription_name, attempting to extract from email`);
              const emailLower = emails[index].content.toLowerCase();
            let extractedName: string | null = null;
            
              // Enhanced service name extraction
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
              else if (emailLower.includes('ahrefs')) extractedName = 'Ahrefs';
            
            if (extractedName) {
              result.subscription_name = extractedName;
                console.log(`Result ${index + 1}: Extracted service name: ${extractedName}`);
            } else {
              result.subscription_name = 'Unknown Service';
                console.log(`Result ${index + 1}: Could not extract service name, using 'Unknown Service'`);
            }
          }
          
            // Validate price
          if (result.price !== undefined && typeof result.price !== 'number') {
            result.price = parseFloat(result.price) || 0;
          }
          
            // Validate confidence score
          if (result.confidence_score !== undefined && typeof result.confidence_score !== 'number') {
            result.confidence_score = parseFloat(result.confidence_score) || 0.8;
          }
            
            // Set defaults for missing fields
            if (!result.currency) result.currency = 'USD';
            if (!result.billing_cycle) result.billing_cycle = 'monthly';
            if (!result.service_provider) result.service_provider = result.subscription_name;
            
            console.log(`Result ${index + 1}: Validated subscription - ${result.subscription_name} at $${result.price} ${result.currency}`);
          } else {
            // For non-subscriptions, ensure confidence score is set
            if (result.confidence_score === undefined || typeof result.confidence_score !== 'number') {
              result.confidence_score = 0.95;
            }
            console.log(`Result ${index + 1}: Not a subscription (confidence: ${result.confidence_score})`);
        }
        
        return result;
        });
        
        console.log(`Successfully processed batch with ${processedResults.length} results`);
        return { results: processedResults };
        
      } catch (parseError) {
        console.log(`Attempt ${attempt}: JSON parse error:`, parseError.message);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          return { error: `Parse failed: ${parseError.message}`, results: [] };
        }
      }
      
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt}: Request error:`, error.message);
      
      if (attempt < maxRetries) {
        const retryDelay = Math.pow(2, attempt) * 5000;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        break;
      }
    }
  }
  
  return { error: `All attempts failed: ${lastError?.message}`, results: [] };
}

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const startTime = Date.now();
    const maxExecutionTime = 7 * 60 * 1000;
    
    // Get scan IDs and user IDs from the request body
    const { scan_ids, user_ids } = await req.json();
    
    console.log(`Starting analysis for scans: ${scan_ids}, users: ${user_ids}`);
    
    if (!scan_ids || !user_ids || scan_ids.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "No scan IDs provided" 
      }), { status: 200 });
    }
    
    // Get the specific scans that were passed from the trigger
    const { data: scans, error: scanError } = await supabase
      .from("scan_history")
      .select("*")
      .in("scan_id", scan_ids);

    if (scanError) {
      console.error("Failed to fetch scans:", scanError);
      return new Response(JSON.stringify({ error: "Failed to fetch scans", details: scanError }), { status: 500 });
    }

    if (!scans || scans.length === 0) {
      console.log("No scans found");
      return new Response(JSON.stringify({ success: true, message: "No scans found" }), { status: 200 });
    }

    console.log(`Found ${scans.length} scans to process`);

    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSubscriptionsFound = 0;

    for (const scan of scans) {
      console.log(`Processing scan ${scan.scan_id} for user ${scan.user_id}`);
      
      if (Date.now() - startTime > maxExecutionTime) {
        console.log(`Processing timeout reached after ${totalProcessed} scans`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Processed ${totalProcessed} scans before timeout`,
          timeout: true
        }), { status: 200 });
      }
      
      // Skip if scan is not in analyzing status (should be set by trigger)
      if (scan.status !== "analyzing") {
        console.log(`Skipping scan ${scan.scan_id} - status is ${scan.status}, expected analyzing`);
        continue;
      }
      
      let quotaExhausted = false;
      let subscriptionsFound = 0;
      const { data: potentialSubscriptions, error: subscriptionError } = await supabase
        .from("subscription_analysis")
        .select("*")
        .eq("scan_id", scan.scan_id)
        .eq("analysis_status", "pending");

      if (subscriptionError) {
        console.error(`Failed to fetch potential subscriptions for scan ${scan.scan_id}:`, subscriptionError);
        await supabase.from("scan_history").update({ 
          status: "error", 
          error_message: `Failed to fetch potential subscriptions: ${subscriptionError.message}`,
          updated_at: new Date().toISOString()
        }).eq("id", scan.id);
        totalErrors++;
        continue;
      }

      if (!potentialSubscriptions || potentialSubscriptions.length === 0) {
        console.log(`No pending analyses found for scan ${scan.scan_id}`);
        // Do not return/continue here; let the completion update run below
      } else {
        console.log(`Found ${potentialSubscriptions.length} pending analyses for scan ${scan.scan_id}`);

        let processedCount = 0;
        let errorCount = 0;
        
        // First, fetch all email data for the pending analyses
        const emailDataPromises = potentialSubscriptions.map(async (analysis) => {
            const { data: emailData, error: emailError } = await supabase
              .from("email_data")
              .select("content, subject, sender, gmail_message_id")
              .eq("id", analysis.email_data_id)
              .single();

          if (emailError || !emailData) {
          console.error(`Failed to fetch email data for analysis ${analysis.id}:`, emailError);
          return { analysis, emailData: null, error: emailError };
          }

        return { analysis, emailData, error: null };
      });
      
      const emailDataResults = await Promise.all(emailDataPromises);
      
      // Filter out emails that couldn't be fetched and group by user for batching
      const validEmails = emailDataResults
        .filter(result => result.emailData && !result.error)
        .map(result => ({
          analysisId: result.analysis.id,
          emailDataId: result.analysis.email_data_id,
          content: result.emailData!.content,
          subject: result.emailData!.subject,
          sender: result.emailData!.sender,
          gmailMessageId: result.emailData!.gmail_message_id
        }));
      
      console.log(`Processing ${validEmails.length} valid emails for scan ${scan.scan_id}`);
      
      // Process emails in batches of 5 (reasonable batch size for Gemini)
      const BATCH_SIZE = 5;
      for (let i = 0; i < validEmails.length; i += BATCH_SIZE) {
        const batch = validEmails.slice(i, i + BATCH_SIZE);
        
        // Check for timeout
        if (Date.now() - startTime > maxExecutionTime) {
          console.log(`Processing timeout reached after ${i} emails`);
          break;
        }
        
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} emails for scan ${scan.scan_id}`);
        
        const batchEmails = batch.map(email => ({
          id: email.analysisId,
          content: email.content,
          subject: email.subject,
          sender: email.sender
        }));
        
        const { results: batchResults, error: batchError } = await analyzeEmailsBatchWithGemini(batchEmails);
        
        console.log(`Batch analysis result for scan ${scan.scan_id}:`, { 
          batchResults: batchResults?.length || 0, 
          batchError 
        });
        
        if (batchError) {
          if (typeof batchError === 'object' && batchError.quota_exhausted) {
              quotaExhausted = true;
            console.log(`Quota exhausted for scan ${scan.scan_id}`);
              
              await supabase.from("scan_history").update({
                status: "quota_exhausted",
                error_message: "Gemini API quota exhausted. Analysis will resume when quota resets.",
                updated_at: new Date().toISOString()
              }).eq("id", scan.id);
              
            // Mark all remaining analyses as pending for quota exhaustion
            for (const email of batch) {
              await supabase.from("subscription_analysis").update({
                analysis_status: 'pending',
                gemini_response: JSON.stringify({ error: batchError, quota_exhausted: true }),
                updated_at: new Date().toISOString()
              }).eq("id", email.analysisId);
            }
              
              break;
            }
            
          // Handle other batch errors
          console.error(`Batch error for scan ${scan.scan_id}:`, batchError);
          for (const email of batch) {
            await supabase.from("subscription_analysis").update({
              analysis_status: 'failed',
              gemini_response: JSON.stringify({ error: batchError }),
              updated_at: new Date().toISOString()
            }).eq("id", email.analysisId);
            errorCount++;
          }
          continue;
        }

        if (!batchResults || batchResults.length === 0) {
          console.log(`No batch results for scan ${scan.scan_id}`);
          continue;
        }

        // Process batch results
        for (let j = 0; j < batch.length; j++) {
          const email = batch[j];
          const geminiResult = batchResults[j];

          if (!geminiResult) {
            console.log(`No result for email ${email.analysisId} in batch`);
            await supabase.from("subscription_analysis").update({
              analysis_status: 'failed',
              gemini_response: JSON.stringify({ error: "No result from batch analysis" }),
              updated_at: new Date().toISOString()
            }).eq("id", email.analysisId);
            errorCount++;
            continue;
          }

          if (geminiResult.error) {
            console.log(`Error in result for email ${email.analysisId}:`, geminiResult.error);
            await supabase.from("subscription_analysis").update({
              analysis_status: 'failed',
              gemini_response: JSON.stringify({ error: geminiResult.error }),
              updated_at: new Date().toISOString()
            }).eq("id", email.analysisId);
            errorCount++;
            continue;
          }

          // Update the analysis record
          const { error: updateError } = await supabase.from("subscription_analysis").update({
            subscription_name: geminiResult.subscription_name,
            price: geminiResult.price,
            currency: geminiResult.currency,
            billing_cycle: geminiResult.billing_cycle,
            next_billing_date: geminiResult.next_billing_date,
            service_provider: geminiResult.service_provider,
            confidence_score: geminiResult.confidence_score,
            analysis_status: geminiResult.is_subscription ? 'completed' : 'not_subscription',
            gemini_response: JSON.stringify(geminiResult),
            updated_at: new Date().toISOString()
          }).eq("id", email.analysisId);

          if (updateError) {
            console.error(`Failed to update analysis for email ${email.analysisId}:`, updateError);
            errorCount++;
            continue;
          }

          console.log(`Processing result for email ${email.analysisId}:`, geminiResult);

          if (geminiResult && geminiResult.is_subscription && geminiResult.subscription_name) {
            console.log(`Found subscription: ${geminiResult.subscription_name} with price ${geminiResult.price} ${geminiResult.currency}`);
            
            const normalizedServiceName = normalizeServiceName(geminiResult.subscription_name);
            
            // Check for existing subscriptions by normalized name AND price
            const { data: existingSubscriptions, error: checkError } = await supabase
              .from("subscriptions")
              .select("name, price")
              .eq("user_id", scan.user_id);
            
            const alreadyExists =
              !checkError &&
              existingSubscriptions &&
              existingSubscriptions.some(sub =>
                normalizeServiceName(sub.name) === normalizedServiceName &&
                Number(sub.price) === Number(geminiResult.price)
              );
            
            if (alreadyExists) {
              console.log(`Subscription ${geminiResult.subscription_name} at price ${geminiResult.price} already exists for user ${scan.user_id}, skipping`);
              processedCount++;
              /* Incremental progress update per email */
              try {
                const progressNow = 30 + Math.floor((processedCount / Math.max(1, validEmails.length)) * 70);
                await supabase.from("scan_history").update({
                  progress: Math.min(99, progressNow),
                  updated_at: new Date().toISOString()
                }).eq("id", scan.id);
                console.log(`Updated progress for scan ${scan.scan_id}: ${Math.min(99, progressNow)}% (${processedCount}/${validEmails.length})`);
              } catch (progressErr) {
                console.error(`Failed to update progress for scan ${scan.scan_id}:`, progressErr);
              }
              continue;
            }
            
            console.log(`Attempting to insert subscription: ${geminiResult.subscription_name} for user ${scan.user_id}`);
            
            const { error: subscriptionError } = await supabase.from("subscriptions").insert({
              user_id: scan.user_id,
              name: geminiResult.subscription_name,
              price: geminiResult.price || 0,
              currency: geminiResult.currency || 'USD',
              billing_cycle: geminiResult.billing_cycle || 'monthly',
              next_billing_date: geminiResult.next_billing_date,
              provider: geminiResult.service_provider,
              category: 'auto-detected',
              email_id: email.gmailMessageId,
              is_manual: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

            if (subscriptionError) {
              console.error(`Failed to insert subscription for user ${scan.user_id}:`, subscriptionError);
              errorCount++;
              continue;
            }

            console.log(`Successfully inserted subscription: ${geminiResult.subscription_name} for user ${scan.user_id}`);
            subscriptionsFound++;
            processedCount++;
            /* Incremental progress update per email */
            try {
              const progressNow = 30 + Math.floor((processedCount / Math.max(1, validEmails.length)) * 70);
              await supabase.from("scan_history").update({
                progress: Math.min(99, progressNow),
                updated_at: new Date().toISOString()
              }).eq("id", scan.id);
              console.log(`Updated progress for scan ${scan.scan_id}: ${Math.min(99, progressNow)}% (${processedCount}/${validEmails.length})`);
            } catch (progressErr) {
              console.error(`Failed to update progress for scan ${scan.scan_id}:`, progressErr);
            }
          } else {
            console.log(`Email ${email.analysisId} is not a subscription`);
            processedCount++;
            /* Incremental progress update per email (non-subscriptions) */
            try {
              const progressNow = 30 + Math.floor((processedCount / Math.max(1, validEmails.length)) * 70);
              await supabase.from("scan_history").update({
                progress: Math.min(99, progressNow),
                updated_at: new Date().toISOString()
              }).eq("id", scan.id);
              console.log(`Updated progress for scan ${scan.scan_id}: ${Math.min(99, progressNow)}% (${processedCount}/${validEmails.length})`);
            } catch (progressErr) {
              console.error(`Failed to update progress for scan ${scan.scan_id}:`, progressErr);
            }
          }
        }
        
        // Add a small delay between batches to be respectful to the API
        if (i + BATCH_SIZE < validEmails.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      }

      // Always attempt to mark scan as completed unless quota exhausted
      if (!quotaExhausted) {
        console.log(`Attempting to mark scan ${scan.scan_id} as completed`);
        const { error: completionError } = await supabase.from("scan_history").update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          subscriptions_found: subscriptionsFound
        }).eq("id", scan.id);
        if (completionError) {
          console.error(`Failed to update scan completion for ${scan.scan_id}:`, completionError);
          totalErrors++;
        } else {
          console.log(`Scan ${scan.scan_id} successfully marked as completed`);
          totalProcessed++;
          totalSubscriptionsFound += subscriptionsFound;
        }
      } else {
        console.log(`Quota exhausted for scan ${scan.scan_id}, not marking as completed`);
      }
    }

    console.log(`All scans processed: ${totalProcessed} successful, ${totalErrors} errors, ${totalSubscriptionsFound} total subscriptions found`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Processed ${totalProcessed} scans successfully, ${totalErrors} errors, ${totalSubscriptionsFound} subscriptions found` 
    }), { status: 200 });
    
  } catch (error) {
    console.error("Unexpected error in Edge Function:", error);
    return new Response(JSON.stringify({ 
      error: "Unexpected error", 
      details: error.message 
    }), { status: 500 });
  }
});