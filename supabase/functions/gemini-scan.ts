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

async function analyzeEmailWithGemini(emailText: string) {
  if (!checkQuota()) {
    return { error: "Rate limit reached", is_subscription: false };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `Analyze this email to identify subscription services. Look for recurring payments, billing notices, subscription confirmations. If it's a subscription, extract: service name, price, currency, billing cycle, next billing date, service provider. Return JSON: {"is_subscription": true/false, "subscription_name": "name", "price": number, "currency": "USD", "billing_cycle": "monthly", "next_billing_date": "YYYY-MM-DD", "service_provider": "name", "confidence_score": 0.95}. For non-subscriptions: {"is_subscription": false, "confidence_score": 0.95}. Email: """${emailText}"""`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { 
      response_mime_type: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1000
    }
  };

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
              return { error: `Quota exhausted`, is_subscription: false, quota_exhausted: true };
            }
          } catch (parseError) {}
          
          lastError = new Error(`Rate limit hit`);
          
          if (attempt < maxRetries) {
            const backoffDelay = Math.pow(2, attempt) * 5000;
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          } else {
            return { error: `Rate limit exceeded`, is_subscription: false };
          }
        }
        
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      
      if (!text) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          return { error: "No response", is_subscription: false };
        }
      }

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            return { error: "No JSON found", is_subscription: false };
          }
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        if (typeof result.is_subscription !== 'boolean') {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            return { error: "Invalid structure", is_subscription: false };
          }
        }
        
        if (result.is_subscription) {
          if (!result.subscription_name || typeof result.subscription_name !== 'string') {
            const emailLower = emailText.toLowerCase();
            let extractedName: string | null = null;
            
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
            } else {
              result.subscription_name = 'Unknown Service';
            }
          }
          
          if (result.price !== undefined && typeof result.price !== 'number') {
            result.price = parseFloat(result.price) || 0;
          }
          
          if (result.confidence_score !== undefined && typeof result.confidence_score !== 'number') {
            result.confidence_score = parseFloat(result.confidence_score) || 0.8;
          }
        }
        
        return result;
      } catch (parseError) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          return { error: "Parse failed", is_subscription: false };
        }
      }
      
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const retryDelay = Math.pow(2, attempt) * 5000;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        break;
      }
    }
  }
  
  return { error: "All attempts failed", is_subscription: false };
}

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const startTime = Date.now();
    const maxExecutionTime = 7 * 60 * 1000;
    
    // Get scan IDs and user IDs from the request body
    const { scan_ids, user_ids } = await req.json();
    
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
      return new Response(JSON.stringify({ error: "Failed to fetch scans", details: scanError }), { status: 500 });
    }

    if (!scans || scans.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No scans found" }), { status: 200 });
    }

    let totalProcessed = 0;
    let totalErrors = 0;

    for (const scan of scans) {
      if (Date.now() - startTime > maxExecutionTime) {
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
      
      const { data: potentialSubscriptions, error: subscriptionError } = await supabase
        .from("subscription_analysis")
        .select("*")
        .eq("scan_id", scan.scan_id)
        .eq("analysis_status", "pending");

      if (subscriptionError) {
        await supabase.from("scan_history").update({ 
          status: "error", 
          error_message: `Failed to fetch potential subscriptions: ${subscriptionError.message}`,
          updated_at: new Date().toISOString()
        }).eq("id", scan.id);
        totalErrors++;
        continue;
      }

      if (!potentialSubscriptions || potentialSubscriptions.length === 0) {
        await supabase.from("scan_history").update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", scan.id);
        totalProcessed++;
        continue;
      }

      let processedCount = 0;
      let errorCount = 0;
      let quotaExhausted = false;
      
      for (const analysis of potentialSubscriptions) {
        try {
          const { data: emailData, error: emailError } = await supabase
            .from("email_data")
            .select("content, subject, sender, gmail_message_id")
            .eq("id", analysis.email_data_id)
            .single();

          if (emailError || !emailData) {
            errorCount++;
            continue;
          }

          const emailContent = `Subject: ${emailData.subject}\nFrom: ${emailData.sender}\nContent: ${emailData.content}`.trim();
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const geminiResult = await analyzeEmailWithGemini(emailContent);

          if (geminiResult.error) {
            if (geminiResult.quota_exhausted) {
              quotaExhausted = true;
              
              await supabase.from("scan_history").update({
                status: "quota_exhausted",
                error_message: "Gemini API quota exhausted. Analysis will resume when quota resets.",
                updated_at: new Date().toISOString()
              }).eq("id", scan.id);
              
              await supabase.from("subscription_analysis").update({
                analysis_status: 'pending',
                gemini_response: JSON.stringify({ error: geminiResult.error, quota_exhausted: true }),
                updated_at: new Date().toISOString()
              }).eq("id", analysis.id);
              
              break;
            }
            
            await supabase.from("subscription_analysis").update({
              analysis_status: 'failed',
              gemini_response: JSON.stringify({ error: geminiResult.error }),
              updated_at: new Date().toISOString()
            }).eq("id", analysis.id);
            errorCount++;
            continue;
          }

          await supabase.from("subscription_analysis").update({
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

          if (geminiResult && geminiResult.is_subscription && geminiResult.subscription_name) {
            const normalizedServiceName = normalizeServiceName(geminiResult.subscription_name);
            
            const { data: existingSubscriptions, error: checkError } = await supabase
              .from("subscriptions")
              .select("name")
              .eq("user_id", scan.user_id)
              .ilike("name", `%${normalizedServiceName}%`);
            
            if (!checkError && existingSubscriptions && existingSubscriptions.length > 0) {
              continue;
            }
            
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
              errorCount++;
              continue;
            }

            processedCount++;
          } else {
            await supabase.from("subscription_analysis").update({
              analysis_status: 'not_subscription',
              gemini_response: JSON.stringify(geminiResult),
              updated_at: new Date().toISOString()
            }).eq("id", analysis.id);
          }
        } catch (analysisError) {
          errorCount++;
          
          await supabase.from("subscription_analysis").update({
            analysis_status: 'failed',
            gemini_response: JSON.stringify({ error: analysisError.message }),
            updated_at: new Date().toISOString()
          }).eq("id", analysis.id);
        }
      }

      if (!quotaExhausted) {
        const { error: completionError } = await supabase.from("scan_history").update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", scan.id);

        if (completionError) {
          totalErrors++;
        } else {
          totalProcessed++;
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Processed ${totalProcessed} scans successfully, ${totalErrors} errors` 
    }), { status: 200 });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Unexpected error", 
      details: error.message 
    }), { status: 500 });
  }
});