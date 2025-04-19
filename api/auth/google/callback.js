// Google OAuth Callback - Standalone handler
import { setCorsHeaders, getPath } from '../../utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all response types
  setCorsHeaders(req, res);

  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Log basic request information for debugging
  const path = getPath(req);
  console.log(`OAuth Callback Handler - Processing ${req.method} request for: ${path}`);
  console.log('Query params:', req.query);
  console.log('Accept:', req.headers.accept);
  console.log('Origin:', req.headers.origin);
  console.log('User Agent:', req.headers['user-agent']);
  console.log('Full request headers:', req.headers);

  // Check for OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Extract code from query parameters
  const { code, redirect = 'https://www.quits.cc/dashboard' } = req.query;

  if (!code) {
    const errorMsg = 'Missing authorization code';
    console.log(`Error: ${errorMsg}`);
    
    // Check if the client accepts JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(400).json({ error: errorMsg });
    }
    
    // Otherwise return HTML
    return res.status(400).send(`
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <h2>Authentication Error</h2>
          <p>${errorMsg}</p>
          <p><a href="https://www.quits.cc/login">Return to login</a></p>
        </body>
      </html>
    `);
  }

  try {
    // Import required modules
    const { google } = await import('googleapis');
    const jwt = await import('jsonwebtoken');

    // Start with the primary redirect URI
    const redirectUri = 'https://www.quits.cc/auth/callback';
    console.log(`Using redirect URI: ${redirectUri}`);
    
    // Print environment variables for debugging
    console.log('Environment variables:');
    console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `Set (length: ${process.env.GOOGLE_CLIENT_ID.length})` : 'Not set');
    console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? `Set (length: ${process.env.GOOGLE_CLIENT_SECRET.length})` : 'Not set');
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? `Set (length: ${process.env.JWT_SECRET.length})` : 'Not set');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('VERCEL_ENV:', process.env.VERCEL_ENV);

    // Always use hardcoded client ID/secret for stability
    const clientId = '82730443897-ji64k4jhk02lonkps5vu54e1q5opoq3g.apps.googleusercontent.com';
    const clientSecret = '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';
    
    console.log(`Using client ID: ${clientId.substring(0, 10)}... and redirect URI: ${redirectUri}`);

    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    console.log(`Created OAuth client with client ID: ${clientId.substring(0, 10)}... and redirect URI: ${redirectUri}`);

    // Exchange code for tokens
    let tokens;
    try {
      console.log(`Attempting to exchange authorization code: ${code.substring(0, 10)}...`);
      const response = await oauth2Client.getToken(code);
      tokens = response.tokens;
      console.log('Token exchange successful, received tokens:', Object.keys(tokens).join(', '));
    } catch (tokenError) {
      console.error('Token exchange error:', tokenError);
      console.error('Token error name:', tokenError.name);
      console.error('Token error message:', tokenError.message);
      console.error('Token error details:', tokenError.response?.data || 'No additional details');
      
      // Try alternate redirect URIs if primary fails
      console.log('Trying alternate redirect URIs');
      const alternateUris = [
        'https://quits.cc/auth/callback',
        'https://www.quits.cc/dashboard',
        redirect
      ];
      
      let altSucceeded = false;
      
      for (const uri of alternateUris) {
        try {
          console.log(`Trying with alternate redirect URI: ${uri}`);
          const altOAuth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            uri
          );
          const response = await altOAuth2Client.getToken(code);
          tokens = response.tokens;
          console.log(`Success with alternate URI: ${uri}`);
          altSucceeded = true;
          break;
        } catch (altError) {
          console.log(`Failed with URI ${uri}:`, altError.message);
        }
      }
      
      // If we still don't have tokens, return an error
      if (!tokens) {
        // Return appropriate format based on Accept header
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          // If it's an invalid_grant error, return a specific message
          if (tokenError.message && tokenError.message.includes('invalid_grant')) {
            return res.status(400).json({
              error: 'invalid_grant',
              message: 'Authorization code has expired or already been used',
              error_details: {
                code_partial: code.substring(0, 10) + '...',
                error_type: tokenError.name,
                error_message: tokenError.message,
                redirect_uri: redirectUri,
                client_id_partial: clientId.substring(0, 10) + '...'
              }
            });
          }
          
          return res.status(400).json({
            error: 'token_exchange_failed',
            message: tokenError.message,
            tried_alternate_uris: alternateUris,
            error_details: {
              code_partial: code.substring(0, 10) + '...',
              error_type: tokenError.name,
              error_message: tokenError.message,
              redirect_uri: redirectUri,
              client_id_partial: clientId.substring(0, 10) + '...'
            }
          });
        }
        
        // HTML response
        return res.status(400).send(`
          <html>
            <head><title>Authentication Error</title></head>
            <body>
              <h2>Authentication Error</h2>
              <p>${tokenError.message || 'Failed to exchange authorization code for tokens'}</p>
              <p>Error details: Code=${code.substring(0, 10)}..., ClientID=${clientId.substring(0, 10)}..., RedirectURI=${redirectUri}</p>
              <p><a href="https://www.quits.cc/login">Return to login</a></p>
            </body>
          </html>
        `);
      }
    }

    // If we reach here, we should have tokens
    console.log('Proceeding with tokens');

    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2('v2');
    console.log('Getting user info with access token');
    const userInfoResponse = await oauth2.userinfo.get({
      auth: oauth2Client,
    });
    const userInfo = userInfoResponse.data;
    console.log('User info received:', userInfo.email);

    if (!userInfo.id || !userInfo.email) {
      throw new Error('Failed to retrieve user information');
    }

    console.log(`User authenticated: ${userInfo.email}`);

    // Generate a JWT token
    console.log('Generating JWT token');
    const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-key';
    console.log(`Using JWT secret: ${jwtSecret.substring(0, 5)}...`);
    
    const token = jwt.default.sign(
      { 
        id: userInfo.id,
        email: userInfo.email,
        gmail_token: tokens.access_token,
        createdAt: new Date().toISOString()
      },
      jwtSecret,
      { expiresIn: '7d' }
    );
    console.log('JWT token generated successfully, length:', token.length);

    // Check if the client accepts JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      console.log('Returning JSON response with token');
      // Return JSON with token and user info
      return res.status(200).json({
        success: true,
        token,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture
        }
      });
    }

    console.log('Generating HTML response with token');
    // Generate HTML page with token in localStorage and auto-redirect
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authentication Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
          .success { color: green; }
          .loader { border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          #debugInfo { background: #f8f8f8; border: 1px solid #ddd; margin-top: 30px; padding: 10px; text-align: left; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto; }
        </style>
      </head>
      <body>
        <h2 class="success">Authentication Successful!</h2>
        <div class="loader"></div>
        <p>Redirecting to dashboard...</p>
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
          
          // Helper to store token and ensure it's stored correctly
          function storeToken(token) {
            try {
              // First clear any existing tokens
              localStorage.removeItem('token');
              localStorage.removeItem('quits_auth_token');
              debug("Cleared existing tokens");
              
              // Try to store new token in both places for consistency
              localStorage.setItem('token', token);
              localStorage.setItem('quits_auth_token', token);
              debug("Attempted to set new token in both locations");
              
              // Verify token was stored correctly
              const storedToken = localStorage.getItem('token');
              const altStoredToken = localStorage.getItem('quits_auth_token');
              
              if (!storedToken) {
                debug('ERROR: Failed to verify primary token storage');
                return false;
              }
              
              if (!altStoredToken) {
                debug('WARNING: Failed to verify secondary token storage');
                // Continue anyway as long as primary storage worked
              }
              
              debug('Token stored successfully and verified');
              return storedToken === token;
            } catch (e) {
              debug('ERROR: Exception storing token: ' + e.message);
              return false;
            }
          }
          
          try {
            debug('Starting token storage process');
            debug('User Agent: ' + navigator.userAgent);
            
            const token = '${token}';
            debug('Token length: ' + token.length);
            
            // Store the token
            const stored = storeToken(token);
            
            if (stored) {
              debug('Token stored successfully. Performing double-check...');
              
              // Double-check the token storage after a brief delay
              setTimeout(() => {
                const doubleCheck = localStorage.getItem('token');
                if (doubleCheck === token) {
                  debug('Double-check passed! Token persistence confirmed');
                  debug('Redirecting to: ${redirect}');
                  
                  // Redirect after a short delay to ensure storage completes
                  setTimeout(function() {
                    window.location.href = '${redirect}';
                  }, 200);
                } else {
                  debug('ERROR: Double-check failed! Token was lost or changed');
                  document.body.innerHTML = '<h2>Authentication Error</h2><p>Failed to reliably store authentication token. Please ensure cookies and localStorage are enabled.</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
                }
              }, 300);
            } else {
              debug('Failed to store token');
              document.body.innerHTML = '<h2>Authentication Error</h2><p>Failed to store authentication token. Please ensure cookies and localStorage are enabled.</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
            }
          } catch (e) {
            debug('Error in script: ' + e.message);
            document.body.innerHTML = '<h2>Authentication Error</h2><p>Error: ' + e.message + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
          }
        </script>
      </body>
      </html>
    `;

    // Set content type to HTML and send the response
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    console.log('Sending HTML response with token');
    return res.send(htmlResponse);

  } catch (error) {
    console.error('OAuth callback error:', error);
    console.error('Error stack:', error.stack);
    
    // Return appropriate format based on Accept header
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({
        error: 'authentication_failed',
        message: error.message,
        details: process.env.NODE_ENV === 'production' ? undefined : error.stack,
        env_info: {
          node_env: process.env.NODE_ENV || 'not set',
          vercel_env: process.env.VERCEL_ENV || 'not set',
          has_google_config: !!process.env.GOOGLE_CLIENT_ID,
          has_jwt_secret: !!process.env.JWT_SECRET
        }
      });
    }
    
    // HTML error response
    return res.status(500).send(`
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <h2>Authentication Error</h2>
          <p>${error.message}</p>
          <p>We are using hardcoded credentials to improve reliability.</p>
          <p><a href="https://www.quits.cc/login">Return to login</a></p>
        </body>
      </html>
    `);
  }
} 