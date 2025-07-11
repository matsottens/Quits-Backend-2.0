import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function analyzeEmailWithGemini(emailText: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `
Extract the following fields from the email below. Return only a JSON object matching this schema:

{
  "service_provider": string,
  "plan_name": string or null,
  "price": number or null,
  "billing_cycle": string or null,
  "next_billing_date": string (YYYY-MM-DD) or null,
  "confirmation_number": string or null
}

Email:
"""
${emailText}
"""
`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { response_mime_type: "application/json" }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  // Try to extract JSON from the response
  try {
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return JSON.parse(text);
  } catch (e) {
    return { error: "Failed to parse Gemini output", raw: data };
  }
}

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Find all scans ready for analysis
  const { data: scans, error: scanError } = await supabase
    .from("scans")
    .select("*")
    .eq("status", "ready_for_analysis");

  if (scanError) {
    return new Response(JSON.stringify({ error: "Failed to fetch scans", details: scanError }), { status: 500 });
  }

  for (const scan of scans) {
    // 2. Get emails for this scan
    const { data: emails, error: emailError } = await supabase
      .from("emails")
      .select("*")
      .eq("scan_id", scan.id);

    if (emailError) {
      await supabase.from("scans").update({ status: "error", error: emailError.message }).eq("id", scan.id);
      continue;
    }

    // 3. Analyze each email with Gemini
    for (const email of emails) {
      const geminiResult = await analyzeEmailWithGemini(email.body || email.content || "");

      // 4. Store the result in subscription_analysis and subscriptions
      await supabase.from("subscription_analysis").insert({
        scan_id: scan.id,
        email_id: email.id,
        analysis: geminiResult,
        created_at: new Date().toISOString()
      });

      // Only insert into subscriptions if service_provider is present
      if (geminiResult && geminiResult.service_provider) {
        await supabase.from("subscriptions").insert({
          user_id: scan.user_id,
          source_analysis_id: scan.id,
          name: geminiResult.service_provider,
          plan_name: geminiResult.plan_name,
          price: geminiResult.price,
          billing_cycle: geminiResult.billing_cycle,
          next_billing_date: geminiResult.next_billing_date,
          confirmation_number: geminiResult.confirmation_number,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: "email_scan"
        });
      }
    }

    // 5. Mark scan as completed
    await supabase.from("scans").update({ status: "completed" }).eq("id", scan.id);
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}); 