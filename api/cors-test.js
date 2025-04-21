// Simple test endpoint to check if CORS is working

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for CORS test');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  // Return information about the request and CORS setup
  return res.status(200).json({
    success: true,
    message: 'CORS test successful',
    request: {
      method: req.method,
      path: req.url || req.path || '/',
      headers: {
        // Include safe headers for debugging
        'content-type': req.headers['content-type'],
        'origin': req.headers['origin'],
        'user-agent': req.headers['user-agent']
      }
    },
    cors: {
      allowed_origin: 'https://www.quits.cc',
      allowed_methods: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
      allowed_credentials: true
    },
    environment: process.env.NODE_ENV || 'development'
  });
} 