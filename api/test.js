export default function handler(req, res) {
  // Set CORS headers for all responses
  const allowedOrigins = ['https://quits.cc', 'https://www.quits.cc'];
  const origin = req.headers.origin || '';
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  } else {
    // Default to www.quits.cc if origin isn't recognized
    res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  }
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Return test data
  res.status(200).json({
    status: 'ok',
    message: 'API is working',
    timestamp: new Date().toISOString(),
    request: {
      origin: origin || 'none',
      host: req.headers.host,
      userAgent: req.headers['user-agent']
    },
    cors: {
      allowedOrigins,
      currentOrigin: origin
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      vercel: true,
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasJwtSecret: !!process.env.JWT_SECRET
    }
  });
} 