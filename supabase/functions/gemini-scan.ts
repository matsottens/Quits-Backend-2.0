// Rewritten Gemini scan edge function: robust progress + always completed
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const normalize = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/* -------------------------------------------------------------------------- */
/* Gemini helper                                                               */
/* -------------------------------------------------------------------------- */
async function analyzeEmailsWithGemini(emails: any[]) {
  const systemPrompt = `You are an expert financial assistant. Analyze the following email contents to identify commercial subscriptions.
For each email, return a single JSON object. Your response for all emails MUST be a valid JSON array of these objects.

The JSON object for each email MUST have this exact structure:
{ "is_subscription": boolean, "subscription_name": string | null, "price": number, "currency": string, "billing_cycle": string, "confidence_score": number }

Use 0 price for trials or if price not found. Default currency: USD, billing_cycle: monthly.`;

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
async function updateProgress(scanId: string, done: number, total: number) {
  const pct = 70 + Math.floor((done / total) * 29); // 70→99
  await supabase.from("scan_history").update({ progress: Math.min(pct, 99), emails_processed: done, updated_at: new Date().toISOString() }).eq("scan_id", scanId);
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
      if (scan.status !== "ready_for_analysis") continue;

      let subsFound = 0;
      let errorMsg: string | null = null;

      try {
        await supabase.from("scan_history").update({ status: "analyzing", progress: 70 }).eq("scan_id", scan.scan_id);

        const { data: rows } = await supabase
          .from("subscription_analysis")
          .select("*, email_data(content,subject,sender)")
          .eq("scan_id", scan.scan_id)
          .eq("analysis_status", "pending");

        const emails = (rows || []).filter((r) => r.email_data);
        if (!emails.length) throw new Error("No emails to analyze");

        const BATCH = 10;
        for (let i = 0; i < emails.length; i += BATCH) {
          const chunk = emails.slice(i, i + BATCH);
          const results = await analyzeEmailsWithGemini(chunk.map((c) => c.email_data));

          for (let j = 0; j < chunk.length; j++) {
            const row = chunk[j];
            const res = results[j] || {};

            await supabase.from("subscription_analysis").update({ analysis_status: "completed", gemini_response: JSON.stringify(res), updated_at: new Date().toISOString() }).eq("id", row.id);

            const price = Number(res.price);
            if (res.is_subscription && res.subscription_name && price > 0) {
              const dup = await supabase.from("subscriptions").select("id").eq("user_id", scan.user_id).ilike("name", `%${normalize(res.subscription_name)}%`);
              if (!dup.data?.length) {
                const { error } = await supabase.from("subscriptions").insert({
                  user_id: scan.user_id,
                  name: res.subscription_name,
                  price,
                  currency: res.currency || "USD",
                  billing_cycle: res.billing_cycle || "monthly",
                  provider: res.subscription_name,
                  category: "auto-detected",
                  is_manual: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
                if (!error) subsFound++;
              }
            }
          }
          await updateProgress(scan.scan_id, Math.min(i + BATCH, emails.length), emails.length);
        }
      } catch (e: any) {
        errorMsg = String(e?.message || e);
        console.error("Gemini scan error", scan.scan_id, errorMsg);
      } finally {
        await supabase.from("scan_history").update({
          status: "completed",
          progress: 100,
          completed_at: new Date().toISOString(),
          subscriptions_found: subsFound,
          error_message: errorMsg,
          updated_at: new Date().toISOString()
        }).eq("scan_id", scan.scan_id);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e: any) {
    console.error("Edge-function fatal", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});