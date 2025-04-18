// Central router handler for multiple endpoints
import { setCorsHeaders, handleOptions, getPath } from './utils.js';

export default function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Handle preflight requests
  if (handleOptions(req, res)) {
    return;
  }
  
  // Get the path
  const path = getPath(req);
  console.log('Serverless router processing path:', path);
  
  // Test endpoint
  if (path === '/api/test' || path === '/test') {
    return res.status(200).json({
      message: 'Test endpoint is working',
      timestamp: new Date().toISOString()
    });
  }
  
  // Environment check endpoint
  if (path === '/api/env-check') {
    return res.status(200).json({
      message: 'Environment check',
      timestamp: new Date().toISOString(),
      env: {
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasJwtSecret: !!process.env.JWT_SECRET,
        nodeEnv: process.env.NODE_ENV
      }
    });
  }
  
  // CORS test endpoint
  if (path === '/api/cors-test') {
    return res.status(200).json({
      message: 'CORS test passed',
      origin: req.headers.origin || 'none',
      corsHeader: res.getHeader('Access-Control-Allow-Origin') || 'none',
      timestamp: new Date().toISOString()
    });
  }
  
  // CSP bypass endpoint - handles Content Security Policy issues
  if (path === '/api/csp-bypass') {
    // When CSP blocks direct access, send a blank HTML page with script tag
    res.setHeader('Content-Type', 'text/html');
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>CSP Bypass</title>
        </head>
        <body>
          <script>
            // Extract token from URL
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');
            
            if (token) {
              // Store token
              localStorage.setItem('quits_auth_token', token);
              console.log('Token stored via CSP bypass');
              
              // Redirect back to app
              window.location.href = '/dashboard';
            } else {
              document.body.innerHTML = 'No token provided.';
            }
          </script>
        </body>
      </html>
    `);
    return;
  }
  
  // Default catch-all response
  return res.status(200).json({
    message: 'Serverless router reached - no specific handler matched',
    path: path,
    time: new Date().toISOString()
  });
} 