// Direct serverless handler that should be easy to deploy
export default function handler(req, res) {
  // Log detailed request information
  console.log('==== SERVERLESS FUNCTION CALLED ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  console.log('Host:', req.headers.host);
  
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
  const origin = req.headers.origin || 'https://www.quits.cc';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  
  console.log('Setting CORS header - Access-Control-Allow-Origin:', origin);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(200).end();
  }
  
  // IMPORTANT: This function will handle multiple path formats
  // The path could be one of these formats:
  // - "/api/google-proxy"  
  // - "api/google-proxy"
  // - "/google-proxy"
  // We need to be flexible in matching
  
  console.log('Checking path matches...');
  
  // Check if path includes each endpoint
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
    path.includes('/google/callback');
  
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
      
      console.log('Generating mock authentication response');
      // For demonstration, return mock data
      return res.status(200).json({
        success: true,
        token: "mock-token-for-testing-" + Date.now(),
        user: {
          id: "123",
          email: "user@example.com",
          name: "Test User",
          picture: "https://example.com/avatar.jpg"
        }
      });
    } catch (error) {
      console.error('Error in Google proxy handler:', error);
      return res.status(500).json({ 
        error: 'Authentication failed', 
        message: error.message,
        stack: process.env.NODE_ENV === 'production' ? null : error.stack
      });
    }
  }
  
  // Google callback endpoint
  if (isGoogleCallback) {
    console.log('Handling Google callback request');
    const redirectUrl = req.query.redirect || 'https://www.quits.cc/dashboard';
    console.log('Redirecting to:', redirectUrl);
    return res.redirect(`${redirectUrl}?token=mock-token-for-testing-${Date.now()}`);
  }
  
  // General auth callback endpoint
  if (isAuthCallback) {
    console.log('Handling auth callback request');
    const code = req.query.code;
    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }
    
    // Generate a mock token
    const token = "mock-token-auth-callback-" + Date.now();
    console.log('Generated mock token:', token);
    
    // Always redirect to www version
    return res.redirect(`https://www.quits.cc/dashboard?token=${token}`);
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