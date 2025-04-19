// Restart OAuth endpoint - Clears cached data and redirects to login
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all response types
  setCorsHeaders(req, res);

  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  console.log('Restart OAuth Handler - Processing request');
  console.log('Query params:', req.query);
  console.log('Headers:', {
    origin: req.headers.origin,
    referer: req.headers.referer,
    accept: req.headers.accept
  });

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Get redirect target from query parameter or default to login
  const { redirect = '/login' } = req.query;
  
  // Generate HTML page that clears localStorage and redirects
  const htmlResponse = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Restarting Authentication...</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
        .loader { border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        #debugInfo { background: #f8f8f8; border: 1px solid #ddd; margin-top: 30px; padding: 10px; text-align: left; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto; }
      </style>
    </head>
    <body>
      <h2>Restarting Authentication</h2>
      <div class="loader"></div>
      <p>Clearing previous authentication data...</p>
      <div id="debugInfo"></div>
      
      <script>
        // Helper to show debug information
        function debug(message) {
          console.log("[Auth Debug] " + message);
          const debugEl = document.getElementById('debugInfo');
          debugEl.innerHTML += message + '<br>';
          // Auto-scroll to bottom
          debugEl.scrollTop = debugEl.scrollHeight;
        }
        
        try {
          debug('Starting OAuth restart process');
          
          // Clear all authentication data from localStorage
          debug('Clearing localStorage tokens...');
          localStorage.removeItem('token');
          localStorage.removeItem('quits_auth_token');
          localStorage.removeItem('user');
          localStorage.removeItem('auth_state');
          
          // Clear all cookies
          debug('Clearing cookies...');
          document.cookie.split(';').forEach(function(c) {
            document.cookie = c.trim().split('=')[0] + '=;' + 'expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
          });
          
          debug('Authentication data cleared successfully');
          
          // Add a random query parameter to ensure we bypass cache
          const redirectUrl = '${redirect}?reset=' + Date.now() + '&force_account_selection=true';
          debug('Redirecting to: ' + redirectUrl);
          
          // Redirect after a short delay to ensure clearing completes
          setTimeout(function() {
            window.location.href = redirectUrl;
          }, 500);
        } catch (e) {
          debug('Error in restart process: ' + e.message);
          // Still try to redirect even if there was an error
          window.location.href = '${redirect}?error=restart_failed&message=' + encodeURIComponent(e.message);
        }
      </script>
    </body>
    </html>
  `;

  // Set response headers
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
  
  // Return the HTML
  return res.send(htmlResponse);
} 