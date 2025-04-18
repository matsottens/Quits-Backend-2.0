// Google OAuth Proxy - Simplified handler to avoid path-to-regexp issues
export default function handler(req, res) {
  // Set CORS headers
  const origin = req.headers.origin || '';
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  console.log('Google Proxy Handler - Request received');
  console.log('URL:', req.url);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  
  // Extract code from query parameters
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }
  
  try {
    // Redirect to the backend for handling
    const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
    const redirectUrl = backendUrl + '?' + new URLSearchParams(req.query).toString();
    
    console.log('Redirecting to:', redirectUrl);
    return res.redirect(307, redirectUrl);
  } catch (error) {
    console.error('Google Proxy Error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
} 