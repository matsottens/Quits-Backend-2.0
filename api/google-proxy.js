// Google OAuth Proxy - Simplified handler to avoid path-to-regexp issues
import { setCorsHeaders, getPath } from './utils.js';
import nodeFetch from 'node-fetch';

// Use node-fetch for older Node.js environments
const fetch = globalThis.fetch || nodeFetch;

export default async function handler(req, res) {
  // Always set CORS headers explicitly for all response types
  setCorsHeaders(req, res);
  
  // Add special security headers
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Handle preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for Google proxy');
    return res.status(204).end();
  }
  
  const path = getPath(req);
  console.log('Google Proxy Handler - Processing request for path:', path);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  console.log('Query params:', req.query);
  
  // Extract code from query parameters
  const { code, redirect, _t } = req.query;
  
  if (!code) {
    console.log('Error: Missing authorization code');
    return res.status(400).json({ 
      error: 'Missing authorization code',
      details: 'The authorization code is required for the Google OAuth flow'
    });
  }
  
  try {
    // Add no-cache headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // Add check for Accept header to determine response format
    const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
    
    // If the client wants JSON, process directly rather than redirecting
    if (wantsJson) {
      console.log('Client requested JSON response, returning pending status');
      
      // Always include the redirect parameter if provided
      const params = new URLSearchParams(req.query);
      
      // Call the main backend handler directly rather than redirecting
      const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
      const fullUrl = backendUrl + '?' + params.toString();
      
      try {
        // Try to get the token directly instead of redirecting
        console.log(`Making direct request to ${fullUrl}`);
        const { google } = await import('googleapis');
        
        // Start with the primary redirect URI
        const redirectUri = 'https://www.quits.cc/auth/callback';
        
        // Create OAuth client
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          redirectUri
        );
        
        // Exchange code for tokens
        try {
          const response = await oauth2Client.getToken(code);
          const tokens = response.tokens;
          
          // Get user info
          oauth2Client.setCredentials(tokens);
          const oauth2 = google.oauth2('v2');
          const userInfoResponse = await oauth2.userinfo.get({
            auth: oauth2Client,
          });
          const userInfo = userInfoResponse.data;
          
          if (!userInfo.id || !userInfo.email) {
            throw new Error('Failed to retrieve user information');
          }
          
          // Generate a JWT token
          const jwt = await import('jsonwebtoken');
          const token = jwt.default.sign(
            { 
              id: userInfo.id,
              email: userInfo.email,
              gmail_token: tokens.access_token,
              createdAt: new Date().toISOString()
            },
            process.env.JWT_SECRET || 'your-jwt-secret-key',
            { expiresIn: '7d' }
          );
          
          // Return success with token
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
        } catch (tokenError) {
          console.error('Token exchange error:', tokenError);
          
          // If it's an invalid_grant error, return a specific message
          if (tokenError.message && tokenError.message.includes('invalid_grant')) {
            return res.status(400).json({
              error: 'invalid_grant',
              message: 'Authorization code has expired or already been used'
            });
          }
          
          // Start background process anyway
          try {
            // Start the authentication process in the background
            await fetch(fullUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              }
            }).then(async response => {
              if (response.ok) {
                console.log('Background authentication succeeded');
              } else {
                console.error('Background authentication failed:', await response.text());
              }
            }).catch(error => {
              console.error('Background authentication error:', error);
            });
          } catch (fetchError) {
            console.error('Failed to start background process:', fetchError);
          }
          
          return res.status(200).json({
            success: false, 
            pending: true,
            message: 'Authentication in progress via background service',
            error: tokenError.message,
            code_partial: code.substring(0, 8) + '...',
            timestamp: Date.now()
          });
        }
      } catch (directError) {
        console.error('Error in direct handling:', directError);
        
        // Start the authentication process in the background
        try {
          await fetch(fullUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          }).then(async response => {
            if (response.ok) {
              console.log('Background authentication succeeded');
            } else {
              console.error('Background authentication failed:', await response.text());
            }
          }).catch(error => {
            console.error('Background authentication error:', error);
          });
        } catch (fetchError) {
          console.error('Failed to start background process:', fetchError);
        }
        
        return res.status(200).json({
          success: false, 
          pending: true,
          message: 'Authentication request forwarded to backend',
          code_partial: code.substring(0, 8) + '...',
          timestamp: Date.now()
        });
      }
    }
    
    // For HTML requests, use a special HTML page that sets localStorage
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authenticating...</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
          .loader { border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <h2>Authenticating with Google</h2>
        <div class="loader"></div>
        <p>Please wait while we complete your authentication...</p>
        <script>
          // Forward the request to the main callback handler
          const code = "${code}";
          const redirectUrl = "${redirect || 'https://www.quits.cc/dashboard'}";
          const timestamp = Date.now();
          
          // Make the request
          fetch(\`https://api.quits.cc/api/auth/google/callback?code=\${encodeURIComponent(code)}&redirect=\${encodeURIComponent(redirectUrl)}&_t=\${timestamp}\`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json'
            }
          })
          .then(response => response.json())
          .then(data => {
            if (data.token) {
              // Store the token
              localStorage.setItem('token', data.token);
              console.log('Token stored successfully');
              
              // Redirect
              window.location.href = redirectUrl;
            } else {
              // Display error
              document.body.innerHTML = '<h2>Authentication Error</h2><p>' + (data.message || 'Failed to authenticate') + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
            }
          })
          .catch(error => {
            // Display error
            document.body.innerHTML = '<h2>Authentication Error</h2><p>' + error.message + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
          });
        </script>
      </body>
      </html>
    `;
    
    // Set response headers
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', "default-src 'self' https://api.quits.cc; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    
    // Return the HTML
    return res.send(htmlResponse);
  } catch (error) {
    console.error('Google Proxy Error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
} 