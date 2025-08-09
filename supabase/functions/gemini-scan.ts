// Rewritten Gemini scan edge function: robust progress + always completed
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const normalize = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// Heuristics and helpers for robust scoring and extraction
const SUBSCRIPTION_KEYWORDS = [
  "subscription", "subscribed", "your plan", "membership", "renewal", "auto-renew",
  "billed", "billing", "payment", "receipt", "invoice", "charged", "charge",
  "trial", "trial ended", "will renew", "has been renewed"
];

const STRONG_TRANSACTIONAL = ["receipt", "invoice", "payment", "charged", "subscription"];

const CURRENCY_SIGNS: Record<string, RegExp> = {
  USD: /(?:\$)\s?(\d{1,4}(?:[.,]\d{2})?)/,
  EUR: /(?:€)\s?(\d{1,4}(?:[.,]\d{2})?)/,
  GBP: /(?:£)\s?(\d{1,4}(?:[.,]\d{2})?)/
};

const EXPLICIT_CURRENCY: Array<{ code: string; re: RegExp }> = [
  { code: "USD", re: /(\d{1,4}(?:[.,]\d{2})?)\s?(?:usd|dollars?)/i },
  { code: "EUR", re: /(\d{1,4}(?:[.,]\d{2})?)\s?(?:eur|euros?)/i },
  { code: "GBP", re: /(\d{1,4}(?:[.,]\d{2})?)\s?(?:gbp|pounds?)/i }
];

function extractPriceAndCurrency(text: string): { price: number | null; currency: string | null } {
  const t = text || "";
  for (const [code, re] of Object.entries(CURRENCY_SIGNS)) {
    const m = t.match(re);
    if (m && m[1]) return { price: Number(m[1].replace(',', '.')), currency: code };
  }
  for (const { code, re } of EXPLICIT_CURRENCY) {
    const m = t.match(re);
    if (m && m[1]) return { price: Number(m[1].replace(',', '.')), currency: code };
  }
  return { price: null, currency: null };
}

function detectBillingCycle(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (/(monthly|per month|\/month)/i.test(t)) return "monthly";
  if (/(yearly|annual|per year|\/year)/i.test(t)) return "yearly";
  if (/(weekly|per week|\/week)/i.test(t)) return "weekly";
  if (/(quarterly|per quarter)/i.test(t)) return "quarterly";
  return null;
}

function keywordScore(text: string): number {
  const t = (text || "").toLowerCase();
  let score = 0;
  for (const k of SUBSCRIPTION_KEYWORDS) if (t.includes(k)) score += 0.05; // cap later
  for (const k of STRONG_TRANSACTIONAL) if (t.includes(k)) score += 0.1;
  return Math.min(score, 0.6);
}

function deriveServiceName(subject: string, sender: string): string | null {
  const fromDomain = (sender || '').match(/@([\w.-]+)/);
  if (fromDomain && fromDomain[1]) {
    const dom = fromDomain[1].split('.')[0];
    if (dom && !['gmail','yahoo','hotmail','outlook','mail','noreply','no-reply'].includes(dom)) {
      return dom.charAt(0).toUpperCase() + dom.slice(1);
    }
  }
  const s = (subject || '').split(/\s+/).find(w => w && w.length > 2);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

/* -------------------------------------------------------------------------- */
/* Gemini helper                                                               */
/* -------------------------------------------------------------------------- */
async function analyzeEmailsWithGemini(emails: any[]) {
  const systemPrompt = `You are an expert financial assistant. Analyze the following emails to identify paid subscription transactions and explicit cancellations (not newsletters or ads).
Return a JSON array. Each element MUST be an object with EXACTLY these keys:
{
  "is_subscription": boolean,
  "subscription_name": string | null,
  "price": number | null,
  "currency": string | null,
  "billing_cycle": "monthly" | "yearly" | "weekly" | "quarterly" | null,
  "confidence_score": number,  // 0.0 to 1.0 reflecting likelihood this is a subscription charge
  "is_cancellation": boolean  // true if the email explicitly confirms cancellation/termination of a subscription
}
Rules:
- Prefer actual charge/receipt/renewal confirmations over marketing.
- If price is not explicitly stated, use null (do NOT invent 0).
- Only set is_subscription true if the email clearly indicates a subscription payment, renewal, or plan details.
- Set is_cancellation true only for explicit cancellation confirmations (e.g., "Your subscription has been canceled").
`;

  const combined = emails.map((e, i) => `EMAIL ${i + 1}:\nSubject: ${e.subject}\nFrom: ${e.sender}\nContent: ${e.content.slice(0, 3000)}`).join("\n\n");

  const body = {
    contents: [{ role: "user", parts: [{ text: systemPrompt + combined }] }],
    generationConfig: { response_mime_type: "application/json", temperature: 0.1, maxOutputTokens: 4096 }
  };

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!resp.ok) throw new Error(`Gemini API error ${resp.status}`);
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  const match = text.match(/```json\s*([\s\S]*?)```/);
  const json = match ? match[1] : text;
  return JSON.parse(json);
}

/* -------------------------------------------------------------------------- */
/* Progress helper                                                             */
/* -------------------------------------------------------------------------- */
async function updateProgress(scanId: string, done: number, total: number, currentBatch?: number, totalBatches?: number) {
  // More granular progress from 70% to 95% during analysis
  let pct: number;
  if (currentBatch !== undefined && totalBatches !== undefined) {
    // When processing batches, update more frequently
    const batchProgress = (currentBatch / totalBatches) * 25; // 25% of the analysis phase
    const emailProgress = (done / total) * 25; // Remaining 25% based on emails processed
    pct = 70 + Math.floor(batchProgress + emailProgress);
  } else {
    pct = 70 + Math.floor((done / total) * 25); // 70→95
  }
  
  console.log(`[${scanId}] Updating analysis progress: ${done}/${total} emails (${Math.min(pct, 95)}%)`);
  await supabase.from("scan_history").update({ 
    progress: Math.min(pct, 95), 
    emails_processed: done, 
    updated_at: new Date().toISOString() 
  }).eq("scan_id", scanId);
}

/* -------------------------------------------------------------------------- */
/* Main handler                                                                */
/* -------------------------------------------------------------------------- */
serve(async (req) => {
  try {
    const { scan_ids } = await req.json();
    if (!Array.isArray(scan_ids) || !scan_ids.length) {
      return new Response(JSON.stringify({ success: true, message: "No scans" }), { status: 200 });
    }

    const { data: scans } = await supabase
      .from("scan_history")
      .select("*")
      .in("scan_id", scan_ids);

    for (const scan of scans || []) {
      // Accept both 'ready_for_analysis' and 'analyzing' to avoid race with trigger
      if (!(scan.status === "ready_for_analysis" || scan.status === "analyzing")) continue;

      let subsFound = 0;
      let errorMsg: string | null = null;

      try {
        const { error: updErr } = await supabase
          .from("scan_history")
          .update({ status: "analyzing", progress: 70, updated_at: new Date().toISOString() })
          .eq("scan_id", scan.scan_id)
          .eq("user_id", scan.user_id);
        if (updErr) throw new Error(`Failed to mark scan analyzing: ${updErr.message}`);

        let { data: rows } = await supabase
          .from("subscription_analysis")
          .select("*, email_data(content,subject,sender)")
          .eq("scan_id", scan.scan_id)
          .eq("analysis_status", "pending");

        // Fallback: if no pending analysis rows found, create them from email_data
        let emails = (rows || []).filter((r) => r.email_data);
        if (!emails.length) {
          const { data: emailRows } = await supabase
            .from("email_data")
            .select("id, subject, sender, content")
            .eq("scan_id", scan.scan_id)
            .eq("user_id", scan.user_id)
            .order("created_at", { ascending: true })
            .limit(200);

          if (emailRows && emailRows.length) {
            // Insert pending analysis entries for any emails missing them
            for (const e of emailRows) {
              await supabase.from("subscription_analysis").insert({
                email_data_id: e.id,
                user_id: scan.user_id,
                scan_id: scan.scan_id,
                analysis_status: "pending",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }

            // Re-query pending rows with join after seeding
            const reseed = await supabase
              .from("subscription_analysis")
              .select("*, email_data(content,subject,sender)")
              .eq("scan_id", scan.scan_id)
              .eq("analysis_status", "pending");
            rows = reseed.data || [];
            emails = (rows || []).filter((r) => r.email_data);
          }
        }

        if (!emails.length) throw new Error("No emails to analyze");

        const BATCH = 10;
        const totalBatches = Math.ceil(emails.length / BATCH);
        console.log(`[${scan.scan_id}] Processing ${emails.length} emails in ${totalBatches} batches of ${BATCH}`);
        
        for (let i = 0; i < emails.length; i += BATCH) {
          const chunk = emails.slice(i, i + BATCH);
          const currentBatch = Math.floor(i / BATCH) + 1;
          
          console.log(`[${scan.scan_id}] Processing batch ${currentBatch}/${totalBatches} (${chunk.length} emails)`);
          const results = await analyzeEmailsWithGemini(chunk.map((c) => c.email_data));

          for (let j = 0; j < chunk.length; j++) {
            const row = chunk[j];
            const email = row.email_data;
            const res = results[j] || {} as any;

            // Local post-processing to improve reliability
            const subject = email?.subject || "";
            const sender = email?.sender || "";
            const content = email?.content || "";
            const combined = `${subject}\n${sender}\n${content}`;

            // Fallback extraction if Gemini omitted price/currency
            let price: number | null = (typeof res.price === 'number' ? res.price : null);
            let currency: string | null = res.currency || null;
            if (price == null) {
              const { price: p2, currency: c2 } = extractPriceAndCurrency(combined);
              price = p2;
              currency = currency || c2;
            }

            // Derive billing cycle when missing
            let billing = res.billing_cycle || detectBillingCycle(combined) || "monthly";

            // Strengthen confidence with heuristics
            const kScore = keywordScore(combined);
            let confidence = Math.max(Number(res.confidence_score || 0), kScore);
            if (price && price > 0) confidence = Math.min(1, confidence + 0.25);
            if (STRONG_TRANSACTIONAL.some(k => (combined.toLowerCase()).includes(k))) confidence = Math.min(1, confidence + 0.1);

            // Service name fallback
            const subName = res.subscription_name || deriveServiceName(subject, sender) || null;

            // Update analysis row with enriched data
            await supabase.from("subscription_analysis").update({
              analysis_status: "completed",
              subscription_name: subName,
              price: price, // Don't default to 0, keep null if no price found
              currency: currency || 'USD',
              billing_cycle: billing,
              confidence_score: confidence,
              gemini_response: JSON.stringify(res),
              updated_at: new Date().toISOString()
            }).eq("id", row.id);

            // Handle cancellations: mark existing subscriptions as canceled
            if (res.is_cancellation && (res.subscription_name || deriveServiceName(subject, sender))) {
              const name = res.subscription_name || deriveServiceName(subject, sender);
              if (name) {
                const { data: rows } = await supabase
                  .from("subscriptions")
                  .select("id")
                  .eq("user_id", scan.user_id)
                  .ilike("name", `%${normalize(name)}%`)
                  .limit(1);
                if (rows && rows.length) {
                  await supabase
                    .from("subscriptions")
                    .update({ status: 'canceled', status_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                    .eq("id", rows[0].id);
                }
              }
            }

            // Only create subscription when clearly valid
            const FINAL_CONFIDENCE_THRESHOLD = 0.6;
            const validPrice = price && typeof price === 'number' && price > 0;
            if (subName && validPrice && confidence >= FINAL_CONFIDENCE_THRESHOLD) {
              console.log(`[${scan.scan_id}] Creating subscription: ${subName} - $${price} ${currency || 'USD'} (confidence: ${confidence})`);
              const dup = await supabase
                .from("subscriptions")
                .select("id")
                .eq("user_id", scan.user_id)
                .ilike("name", `%${normalize(subName)}%`);
              if (!dup.data?.length) {
                const { error } = await supabase.from("subscriptions").insert({
                  user_id: scan.user_id,
                  name: subName,
                  price,
                  currency: currency || "USD",
                  billing_cycle: billing || "monthly",
                  provider: subName,
                  category: "auto-detected",
                  is_manual: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
                if (!error) subsFound++;
              }
            }
            
            // Update progress after each email within the batch for more frequent updates
            const emailsProcessedSoFar = i + j + 1;
            if (emailsProcessedSoFar % 2 === 0 || emailsProcessedSoFar === emails.length) {
              await updateProgress(scan.scan_id, emailsProcessedSoFar, emails.length, currentBatch, totalBatches);
            }
          }
          
          // Always update progress after completing each batch
          const emailsProcessedThisBatch = Math.min(i + BATCH, emails.length);
          await updateProgress(scan.scan_id, emailsProcessedThisBatch, emails.length, currentBatch, totalBatches);
          
          console.log(`[${scan.scan_id}] Completed batch ${currentBatch}/${totalBatches}, processed ${emailsProcessedThisBatch}/${emails.length} emails`);
        }
      } catch (e: any) {
        errorMsg = String(e?.message || e);
        console.error("Gemini scan error", scan.scan_id, errorMsg);
      } finally {
        const { error: finErr } = await supabase.from("scan_history").update({
          status: "completed",
          progress: 100,
          completed_at: new Date().toISOString(),
          subscriptions_found: subsFound,
          error_message: errorMsg,
          updated_at: new Date().toISOString()
        }).eq("scan_id", scan.scan_id).eq("user_id", scan.user_id);
        if (finErr) console.error("Failed final update", finErr.message);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e: any) {
    console.error("Edge-function fatal", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});