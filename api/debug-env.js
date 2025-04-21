// Debug endpoint to display environment variables for troubleshooting
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Get environment variables but mask sensitive values
    const safeEnv = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'set' : 'not set',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'set' : 'not set',
      JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'not set',
      REDIRECT_URI: process.env.REDIRECT_URI || 'not set',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'not set',
    };

    res.status(200).json({
      message: 'Debug environment information',
      environment: safeEnv,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in debug-env endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
} 