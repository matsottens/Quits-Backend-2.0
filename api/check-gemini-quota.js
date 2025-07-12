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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('QUOTA-DEBUG: Checking Gemini API quota status');
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'Gemini API key not configured',
        quota_status: 'not_configured'
      });
    }

    // Make a simple test call to check quota
    const testPrompt = 'Hello, this is a quota test. Please respond with "OK".';
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: testPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 10,
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('QUOTA-DEBUG: Gemini API quota check successful');
      
      return res.status(200).json({
        quota_status: 'available',
        message: 'Gemini API quota is available',
        test_response: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text'
      });
    } else {
      const errorData = await response.json();
      console.error('QUOTA-DEBUG: Gemini API quota check failed:', errorData);
      
      if (response.status === 429 && errorData.error?.status === 'RESOURCE_EXHAUSTED') {
        return res.status(200).json({
          quota_status: 'exhausted',
          message: 'Gemini API quota has been exhausted',
          error_details: errorData.error,
          recommendation: 'Consider upgrading your Gemini API plan or wait until the next billing cycle'
        });
      } else if (response.status === 429) {
        return res.status(200).json({
          quota_status: 'rate_limited',
          message: 'Gemini API is rate limited (temporary)',
          error_details: errorData.error,
          recommendation: 'This is temporary, retry in a few minutes'
        });
      } else {
        return res.status(200).json({
          quota_status: 'error',
          message: 'Gemini API error',
          error_details: errorData.error,
          status_code: response.status
        });
      }
    }
  } catch (error) {
    console.error('QUOTA-DEBUG: Error checking Gemini quota:', error);
    return res.status(500).json({ 
      error: 'Failed to check Gemini API quota',
      details: error.message,
      quota_status: 'unknown'
    });
  }
} 