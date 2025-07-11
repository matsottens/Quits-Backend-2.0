export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan",
      { method: "POST" }
    );
    const data = await response.text();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
} 