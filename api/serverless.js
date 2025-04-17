// Direct serverless handler that should be easy to deploy
export default function handler(req, res) {
  // Log detailed request information
  console.log('==== SERVERLESS FUNCTION CALLED ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  console.log('Host:', req.headers.host);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Fix path extraction - handle both with and without query string
  let path = req.url;
  const queryIndex = path.indexOf('?');
  if (queryIndex !== -1) {
    path = path.substring(0, queryIndex);
  }
  
  // Fix path normalization - remove trailing slashes
  while (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  
  console.log('Normalized path:', path);
  console.log('Query params:', req.query);
  
  // CRITICAL: Set CORS headers to match the exact requesting origin
  const origin = req.headers.origin;
  
  // Allow both www and non-www domains for quits.cc and localhost for development
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log('Setting CORS header - Access-Control-Allow-Origin:', origin);
  } else {
    // Default fallback if no origin header
    res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
    console.log('Setting default CORS header - Access-Control-Allow-Origin: https://www.quits.cc');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  // IMPORTANT: Include Cache-Control in the allowed headers
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Log the CORS headers for debugging
  console.log('CORS headers set:', {
    'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
    'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers'),
    'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods')
  });
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(204).end(); // Using 204 No Content is more appropriate for OPTIONS
  }
  
  // IMPORTANT: This function will handle multiple path formats
  // The path could be one of these formats:
  // - "/api/google-proxy"  
  // - "api/google-proxy"
  // - "/google-proxy"
  // We need to be flexible in matching
  
  console.log('Checking path matches...');
  
  // Check if path includes each endpoint - be very flexible with path matching
  const isGoogleProxy = 
    path === '/api/google-proxy' || 
    path === 'api/google-proxy' || 
    path === '/google-proxy' ||
    path.includes('google-proxy');
    
  const isGoogleCallback = 
    path === '/api/auth/google/callback' || 
    path === 'api/auth/google/callback' || 
    path === '/auth/google/callback' ||
    path === '/google/callback' ||
    path === '/auth/callback' ||
    path.includes('/google/callback') ||
    path.includes('/auth/callback');
  
  const isAuthCallback =
    path === '/auth/callback' ||
    path === 'auth/callback';
    
  const isHealthCheck = 
    path === '/api/health' || 
    path === 'api/health' || 
    path === '/health';
    
  const isTestEndpoint = 
    path === '/api/test' || 
    path === 'api/test' || 
    path === '/test';
  
  console.log('Path matching results:', {
    isGoogleProxy,
    isGoogleCallback,
    isAuthCallback,
    isHealthCheck,
    isTestEndpoint
  });
  
  // Check if Google OAuth credentials are correctly set
  const hasGoogleCredentials = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
  console.log('Has Google credentials:', hasGoogleCredentials ? 'Yes' : 'No');
  
  // Health and test endpoints
  if (isHealthCheck || isTestEndpoint) {
    console.log('Handling health/test request');
    return res.status(200).json({
      status: 'ok',
      message: 'API is working',
      timestamp: new Date().toISOString(),
      path: path,
      originalUrl: req.url,
      origin: origin,
      cors: {
        allowOrigin: res.getHeader('Access-Control-Allow-Origin')
      },
      envConfig: {
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasJwtSecret: !!process.env.JWT_SECRET
      }
    });
  }
  
  // Google proxy endpoint
  if (isGoogleProxy) {
    console.log('Handling Google proxy request');
    try {
      if (!req.query.code) {
        console.log('No code parameter provided');
        return res.status(400).json({ 
          error: 'Missing code parameter',
          query: req.query 
        });
      }
      
      // Always delegate to the dedicated handler regardless of credentials
      console.log('Delegating to google-proxy.js handler');
      
      // Use the backend API URL which should have the credentials
      const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
      const redirectUrl = backendUrl + '?' + new URLSearchParams(req.query).toString();
      
      console.log('Redirecting to backend handler:', redirectUrl);
      return res.redirect(307, redirectUrl);
    } catch (error) {
      console.error('Error in Google proxy handler:', error);
      return res.status(500).json({ 
        error: 'Authentication failed', 
        message: error.message,
        stack: process.env.NODE_ENV === 'production' ? null : error.stack
      });
    }
  }
  
  // Google/Auth callback endpoint - Handle both general auth callback and specific Google callback
  if (isGoogleCallback || isAuthCallback) {
    console.log('Handling Auth/Google callback request');
    
    // Get the code and state from query parameters
    const { code, state } = req.query;
    
    if (!code) {
      console.log('Missing authorization code');
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    
    // Always redirect to the backend API
    console.log('Redirecting to backend API for proper token exchange');
    const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
    const callbackUrl = backendUrl + '?' + new URLSearchParams(req.query).toString();
    
    console.log('Redirecting to backend handler:', callbackUrl);
    return res.redirect(307, callbackUrl);
  }
  
  // Catch-all route for any other API endpoint
  console.log('No specific handler found, using catch-all');
  console.log('Full request details:', {
    url: req.url,
    method: req.method,
    path: path,
    headers: req.headers,
    query: req.query
  });
  
  return res.status(200).json({
    message: 'API endpoint reached (catch-all)',
    requestedPath: path,
    originalUrl: req.url,
    time: new Date().toISOString(),
    origin: origin,
    cors: {
      allowOrigin: res.getHeader('Access-Control-Allow-Origin')
    }
  });
} 