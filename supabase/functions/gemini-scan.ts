// Rewritten Gemini scan edge function for improved accuracy
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CONFIG --------------------------------------------------------------
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// --- HELPERS -------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

async function analyzeEmailsWithGemini(emails) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const emailPrompts = emails.map((e, i) => 
    `--- EMAIL ${i + 1} ---\nSubject: ${e.subject}\nFrom: ${e.sender}\nContent: ${e.content.slice(0, 3000)}`
  ).join("\n\n");

  const systemPrompt = `
You are an expert financial assistant. Analyze the following email contents to identify commercial subscriptions.
For each email, return a single JSON object. Your response for all emails MUST be a valid JSON array of these objects.

The JSON object for each email MUST have this exact structure:
{
  "is_subscription": boolean,
  "subscription_name": string | null,
  "price": number,
  "currency": string,
  "billing_cycle": string,
  "confidence_score": number
}

- "is_subscription": Must be true only if you are certain it is a recurring subscription (e.g., monthly, yearly). One-time purchases are not subscriptions.
- "subscription_name": The commercial name of the service, e.g., "Netflix Premium".
- "price": The numerical cost. It MUST be a number, not a string. Use 0 if the price is not found or if it is a free trial.
- "currency": The 3-letter ISO currency code, e.g., "USD". Default to "USD" if not found.
- "billing_cycle": Must be one of "monthly", "yearly", "quarterly", or "weekly". Default to "monthly".
- "confidence_score": A score from 0.0 to 1.0 indicating your confidence.

If an email is not a subscription, set "is_subscription" to false and the other fields to null or default values. Do not invent details.

Example for a Netflix email:
{
  "is_subscription": true,
  "subscription_name": "Netflix",
  "price": 15.49,
  "currency": "USD",
  "billing_cycle": "monthly",
  "confidence_score": 0.95
}

Now, analyze these emails and provide the JSON array:
`;

  const body = {
    contents: [{
      role: "user",
      parts: [{ text: systemPrompt + emailPrompts }]
    }],
    generationConfig: { 
      response_mime_type: "application/json",
      temperature: 0.1,
      maxOutputTokens: 4096, // Increased to handle larger batches
    },
  };

    try {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errorBody = await res.text();
        console.error("Gemini API Error:", res.status, errorBody);
        return []; // Return empty array on API error
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    // Extract JSON array from markdown code block if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
    const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[2]) : "[]";

    return JSON.parse(jsonString);
      
    } catch (error) {
    console.error("Error calling or parsing Gemini response:", error);
    return []; // Return empty array on failure
  }
}

async function updateProgress(scanId, processed, total) {
  // Progress from 70% (start of analysis) to 99%
  const pct = 70 + Math.floor((processed / total) * 29);
  await supabase.from("scan_history").update({
    progress: Math.min(pct, 99),
    emails_processed: processed,
    updated_at: new Date().toISOString()
  }).eq("scan_id", scanId);
}

// --- MAIN ----------------------------------------------------------------
serve(async (req) => {
  try {
    const { scan_ids } = await req.json();
    if (!scan_ids?.length) {
      return new Response(JSON.stringify({ success: true, message: "No scans to process" }), { status: 200 });
    }

    const { data: scans } = await supabase.from("scan_history").select("*").in("scan_id", scan_ids);

    for (const scan of scans || []) {
      // Only process scans that are ready for analysis
      if (scan.status !== "ready_for_analysis") continue;

      // Mark as analyzing
      await supabase.from("scan_history").update({ status: 'analyzing', progress: 70 }).eq('scan_id', scan.scan_id);

      const { data: analyses } = await supabase
        .from("subscription_analysis")
        .select("*, email_data(content,subject,sender)")
        .eq("scan_id", scan.scan_id)
        .eq("analysis_status", "pending");

      const validEmails = analyses?.filter((a) => a.email_data) || [];
      if (validEmails.length === 0) {
        // No emails to analyze, mark as complete
        await supabase.from("scan_history").update({
            status: "completed", progress: 100, completed_at: new Date().toISOString()
        }).eq("scan_id", scan.scan_id);
        continue;
      }

      const BATCH_SIZE = 10; // Process 10 emails at a time
      let totalSubsFound = 0;
      let errorMessage: string | null = null;

      try {
        for (let i = 0; i < validEmails.length; i += BATCH_SIZE) {
          const batch = validEmails.slice(i, i + BATCH_SIZE);
          const emailContents = batch.map(b => b.email_data);

          const results = await analyzeEmailsWithGemini(emailContents);

          for (let j = 0; j < batch.length; j++) {
            const analysisRow = batch[j];
            const result = results[j] || {};

              await supabase.from("subscription_analysis").update({
              analysis_status: "completed",
              gemini_response: JSON.stringify(result),
              updated_at: new Date().toISOString()
            }).eq("id", analysisRow.id);

            const price = Number(result.price);
            const isFree = !price || price <= 0;

            if (result.is_subscription && result.subscription_name && !isFree) {
              const nameNorm = normalize(result.subscription_name);
              const { data: existing } = await supabase.from("subscriptions").select("id").eq("user_id", scan.user_id).ilike("name", `%${nameNorm}%`);

              if (!existing?.length) {
                const { error: insertErr } = await supabase.from("subscriptions").insert({
                user_id: scan.user_id,
                  name: result.subscription_name,
                  price: result.price ?? 0,
                  currency: result.currency ?? "USD",
                  billing_cycle: result.billing_cycle ?? "monthly",
                  provider: result.subscription_name, // Use name as provider
                  category: "auto-detected",
                is_manual: false,
                created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });

                if (insertErr) {
                  console.error("Failed to insert subscription:", insertErr);
                } else {
                  totalSubsFound++;
                }
              }
            }
          }
          await updateProgress(scan.scan_id, i + batch.length, validEmails.length);
        }
      } catch (err) {
        console.error("Gemini scan error for scan", scan.scan_id, err);
        errorMessage = String(err?.message || err);
      } finally {
        await supabase.from("scan_history").update({
          status: "completed",
          progress: 100,
          completed_at: new Date().toISOString(),
          subscriptions_found: totalSubsFound,
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        }).eq("scan_id", scan.scan_id);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});