export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('TRIGGER-DEBUG: Triggering Gemini analysis for scans ready_for_analysis');
    
    const response = await fetch(
      "https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan",
      { 
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('TRIGGER-DEBUG: Edge Function error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Edge Function error', 
        details: errorText 
      });
    }
    
    const data = await response.json();
    console.log('TRIGGER-DEBUG: Edge Function response:', data);
    
    res.status(200).json({ 
      success: true, 
      message: 'Gemini analysis triggered successfully',
      data 
    });
  } catch (error) {
    console.error('TRIGGER-DEBUG: Error triggering Gemini analysis:', error);
    res.status(500).json({ 
      error: 'Failed to trigger Gemini analysis',
      details: error.message 
    });
  }
} 