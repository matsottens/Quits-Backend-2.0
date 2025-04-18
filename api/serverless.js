// Direct serverless handler with simplified route handling
export default function handler(req, res) {
  // Log basic request information
  console.log('==== SERVERLESS FUNCTION CALLED ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  
  // Set CORS headers for all requests
  const origin = req.headers.origin || 'https://www.quits.cc';
  
  // Allow both www and non-www domains for quits.cc and localhost for development
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Extract the normalized path (remove query strings and trailing slashes)
  let path = req.url || '';
  const queryIndex = path.indexOf('?');
  if (queryIndex !== -1) {
    path = path.substring(0, queryIndex);
  }
  while (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  
  // Simple direct matching without complex patterns or includes()
  console.log('Processing request for path:', path);
  
  // Health check
  if (path === '/api/health' || path === '/health') {
    return res.status(200).json({
      status: 'ok',
      message: 'API is working',
      timestamp: new Date().toISOString()
    });
  }
  
  // Google proxy route
  if (path === '/api/google-proxy' || path === '/google-proxy') {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
      }
      
      // Redirect to backend
      const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
      const redirectUrl = backendUrl + '?' + new URLSearchParams(req.query).toString();
      console.log('Redirecting to:', redirectUrl);
      return res.redirect(307, redirectUrl);
    } catch (error) {
      console.error('Error in Google proxy:', error);
      return res.status(500).json({ error: 'Authentication failed', message: error.message });
    }
  }
  
  // Google/Auth callback
  if (path === '/api/auth/google/callback' || path === '/auth/google/callback') {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
      }
      
      // Always redirect to the main backend API
      const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
      const callbackUrl = backendUrl + '?' + new URLSearchParams(req.query).toString();
      console.log('Redirecting to backend handler:', callbackUrl);
      return res.redirect(307, callbackUrl);
    } catch (error) {
      console.error('Error in auth callback:', error);
      return res.status(500).json({ error: 'Authentication failed', message: error.message });
    }
  }
  
  // Default response for any other route
  return res.status(200).json({
    message: 'API endpoint reached (default handler)',
    path: path,
    time: new Date().toISOString()
  });
} 