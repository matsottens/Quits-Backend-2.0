export default async function handler(req, res) {
  console.log('TRIGGER-DEBUG: ===== GEMINI SCAN TRIGGER CALLED =====');
  console.log('TRIGGER-DEBUG: Method:', req.method);
  console.log('TRIGGER-DEBUG: URL:', req.url);
  console.log('TRIGGER-DEBUG: Headers:', Object.keys(req.headers));
  console.log('TRIGGER-DEBUG: Body:', req.body);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    console.log('TRIGGER-DEBUG: Handling OPTIONS preflight request');
    return res.status(204).end();
  }

  // Accept both GET (for cron jobs) and POST (for frontend requests)
  if (req.method !== 'GET' && req.method !== 'POST') {
    console.log('TRIGGER-DEBUG: Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }

  try {
    console.log('TRIGGER-DEBUG: Processing', req.method, 'request');
    
    // Check if we have the required environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('TRIGGER-DEBUG: Missing SUPABASE_SERVICE_ROLE_KEY');
      return res.status(500).json({ error: 'Missing service role key' });
    }
    
    console.log('TRIGGER-DEBUG: Triggering Gemini analysis for scans ready_for_analysis');
    console.log('TRIGGER-DEBUG: Edge Function URL: https://dstsluflwxzkwouxcjkh.supabase.co/functions/v1/gemini-scan');
    
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
    
    console.log('TRIGGER-DEBUG: Edge Function response status:', response.status);
    
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
    console.error('TRIGGER-DEBUG: Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to trigger Gemini analysis',
      details: error.message 
    });
  }
} 