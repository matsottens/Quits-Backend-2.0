// Endpoint to restart OAuth flow and clear cached data
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all response types
  setCorsHeaders(req, res);
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Clear any in-memory cache for this IP address
  const clientIp = req.headers['x-real-ip'] || 
                   req.headers['x-forwarded-for'] || 
                   req.connection.remoteAddress || 
                   'unknown';
  
  console.log(`Restarting OAuth flow for client: ${clientIp}`);
  
  // Get the redirect URL from query params or default to login page
  const redirectUrl = req.query.redirect || '/login';
  
  // Prepare HTML response that will clear localStorage and sessionStorage
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Restarting Authentication</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
        .info { color: #333; }
        .loader { border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <h2>Restarting Authentication</h2>
      <div class="loader"></div>
      <p class="info">Clearing authentication data...</p>
      
      <script>
        // Clear all authentication data from the browser
        function clearAuthData() {
          try {
            console.log('Clearing localStorage auth data');
            localStorage.removeItem('token');
            localStorage.removeItem('quits_auth_token');
            localStorage.removeItem('google_auth_started');
            
            console.log('Clearing sessionStorage auth data');
            sessionStorage.removeItem('processed_oauth_codes');
            sessionStorage.removeItem('oauth_state');
            
            console.log('Clearing cookies');
            document.cookie.split(';').forEach(function(c) {
              document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
            });
            
            document.querySelector('p.info').textContent = 'Authentication data cleared. Redirecting...';
            
            // Redirect to login page after a short delay
            setTimeout(function() {
              window.location.href = '${redirectUrl}';
            }, 1000);
          } catch (error) {
            console.error('Error clearing auth data:', error);
            document.querySelector('p.info').textContent = 'Error clearing auth data: ' + error.message;
          }
        }
        
        // Run cleanup immediately
        clearAuthData();
      </script>
    </body>
    </html>
  `;
  
  // Return HTML response
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  return res.send(html);
} 