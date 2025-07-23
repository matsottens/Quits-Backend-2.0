// Rewritten concise Gemini scan edge function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CONFIG --------------------------------------------------------------
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// --- HELPERS -------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

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

      const valid = analyses?.filter((a: any) => a.email_data) || [];
      const BATCH_SIZE = valid.length <= 10 ? 1 : 5;
      let processed = 0;
      let subsFound = 0;

      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        await updateProgress(scan.scan_id, processed, valid.length);
        const batch = valid.slice(i, i + BATCH_SIZE);
        const results = await geminiBatch(batch.map((b: any) => b.email_data));

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
              await supabase.from("subscriptions").insert({
                user_id: scan.user_id,
                name: r.subscription_name,
                price: price,
                currency: r.currency || "USD",
                billing_cycle: r.billing_cycle || "monthly",
                next_billing_date: r.next_billing_date,
                provider: r.service_provider,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              subsFound++;
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