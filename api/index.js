export default function handler(req, res) {
  // Set CORS headers
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
  
  // Return basic API info
  res.status(200).json({
    name: 'Quits API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    origin: origin || 'none',
    endpoints: [
      '/api/health',
      '/api/test',
      '/api/google-proxy',
      '/api/auth/google',
      '/api/auth/google/callback'
    ]
  });
} 