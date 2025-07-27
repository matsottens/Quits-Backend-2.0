// Rewritten concise Gemini scan edge function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CONFIG --------------------------------------------------------------
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

<<<<<<< HEAD
// ===== Runtime Environment Validation (executes at import time) =====
if (!GEMINI_API_KEY) {
  console.warn("[gemini-scan] Warning: GEMINI_API_KEY is not set – analysis requests will fail. Scans will be marked as error.");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[gemini-scan] Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing – Edge Function cannot access database and will exit early.");
}

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
  // Immediately abort if the key is not present – prevents unnecessary fetch attempts and clearer error reporting
  if (!GEMINI_API_KEY) {
    return { error: "Missing GEMINI_API_KEY", results: [] } as const;
  }

  if (!checkQuota()) {
    return { error: "Rate limit reached", results: [] };
  }
=======
// --- HELPERS -------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7

async function geminiBatch(emails: any[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = emails
    .map((e, i) => `EMAIL ${i + 1}:\nSubject:${e.subject}\nFrom:${e.sender}\nContent:${e.content.slice(0, 800)}`)
    .join("\n\n");

  const body = {
    contents: [{ role: "user", parts: [{ text: `Return JSON array of objects for each email with fields is_subscription, subscription_name, price, currency, billing_cycle, next_billing_date, service_provider, confidence_score.\n${prompt}` }] }],
    generationConfig: { response_mime_type: "application/json", temperature: 0.1, maxOutputTokens: 2048 },
  };

  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  return JSON.parse(text.match(/\[[\s\S]*\]/) || "[]");
}

async function updateProgress(scanId: string, processed: number, total: number) {
  const pct = 30 + Math.floor((processed / total) * 70);
  await supabase.from("scan_history").update({ progress: Math.min(pct, 99), emails_processed: processed, updated_at: new Date().toISOString() }).eq("scan_id", scanId);
}

// --- MAIN ----------------------------------------------------------------
serve(async (req) => {
<<<<<<< HEAD
  // Validate essential env variables once per invocation
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[gemini-scan] Fatal: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    return new Response(JSON.stringify({
      error: "Server misconfiguration: missing SUPABASE credentials"
    }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

=======
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
  try {
    const { scan_ids } = await req.json();
    if (!scan_ids?.length) return new Response(JSON.stringify({ success: true, message: "No scans" }), { status: 200 });

    const { data: scans } = await supabase.from("scan_history").select("*").in("scan_id", scan_ids);
    for (const scan of scans || []) {
      if (scan.status !== "analyzing") continue;

      const { data: analyses } = await supabase
        .from("subscription_analysis")
        .select("*, email_data(content,subject,sender,gmail_message_id)")
        .eq("scan_id", scan.scan_id)
        .eq("analysis_status", "pending");

<<<<<<< HEAD
      // If there are *no* pending analyses for this scan after email collection, finish early to avoid getting stuck in "analyzing"
      if (!subscriptionError && (!potentialSubscriptions || potentialSubscriptions.length === 0)) {
        console.log(`[gemini-scan] No pending analyses for scan ${scan.scan_id} – marking as completed (0 subscriptions found)`);
        await supabase.from("scan_history").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          subscriptions_found: 0
        }).eq("id", scan.id);
        totalProcessed++;
        continue; // move to next scan
      }

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
=======
      const valid = analyses?.filter((a: any) => a.email_data) || [];
      const BATCH_SIZE = valid.length <= 10 ? 1 : 5;
      let processed = 0;
      let subsFound = 0;
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7

      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        await updateProgress(scan.scan_id, processed, valid.length);
        const batch = valid.slice(i, i + BATCH_SIZE);
        const results = await geminiBatch(batch.map((b: any) => b.email_data));

<<<<<<< HEAD
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
          // Provide clearer error propagation to the parent scan record so the dashboard can surface it
          await supabase.from("scan_history").update({
            status: "error",
            // Cast batchError to any to safely access message in non-strict Deno environment
            error_message: typeof batchError === "string" ? batchError : JSON.stringify(batchError as any),
            updated_at: new Date().toISOString()
          }).eq("id", scan.id);

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
=======
>>>>>>> 0d7bfdc37919de0dd0b430b9ea025523c658bea7
        for (let j = 0; j < batch.length; j++) {
          const analysis = batch[j];
          const r = results[j] || {};
          const price = Number(r.price);
          const isFree = !price || price <= 0;

          await supabase
            .from("subscription_analysis")
            .update({ analysis_status: "completed", gemini_response: JSON.stringify(r), updated_at: new Date().toISOString() })
            .eq("id", analysis.id);

          if (r.is_subscription && r.subscription_name && !isFree) {
            const nameNorm = normalize(r.subscription_name);
            const { data: existing } = await supabase
              .from("subscriptions")
              .select("id")
              .eq("user_id", scan.user_id)
              .ilike("name", `%${nameNorm}%`);
            if (!existing?.length) {
              // Insert the newly detected subscription directly into the subscriptions table
              const { error: insertErr } = await supabase.from("subscriptions").insert({
                user_id: scan.user_id,
                name: r.subscription_name,
                price: r.price ?? 0, // column is NOT NULL
                currency: r.currency ?? "USD",
                billing_cycle: r.billing_cycle ?? "monthly",
                next_billing_date: r.next_billing_date ?? null,
                provider: r.service_provider ?? r.subscription_name,
                category: "auto-detected",
                email_id: analysis.email_data_id,
                is_manual: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

              if (insertErr) {
                console.error("Failed to insert subscription", insertErr);
              } else {
                subsFound++;
              }
            }
          }
          processed++;
          await updateProgress(scan.scan_id, processed, valid.length);
        }
      }

      await supabase
        .from("scan_history")
        .update({ status: "completed", progress: 100, completed_at: new Date().toISOString(), subscriptions_found: subsFound })
        .eq("scan_id", scan.scan_id);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});