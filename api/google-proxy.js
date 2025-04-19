// Google OAuth Proxy - Simplified handler to avoid path-to-regexp issues
import { setCorsHeaders, getPath } from './utils.js';
import nodeFetch from 'node-fetch';

// Use node-fetch for older Node.js environments
const fetch = globalThis.fetch || nodeFetch;

// Simple in-memory cache to track already processed codes
// This helps prevent multiple attempts with the same code
const processedCodes = new Map();

// Clear old entries from the cache every hour
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of processedCodes.entries()) {
    // Remove entries older than 1 hour
    if (now - data.timestamp > 3600000) {
      processedCodes.delete(code);
    }
  }
}, 3600000); // Run every hour

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
  
  // Check if this code has already been processed
  if (processedCodes.has(code)) {
    const cachedResult = processedCodes.get(code);
    console.log(`Using cached result for code ${code.substring(0, 8)}...`);
    
    // If we have a successful result with a token, return it
    if (cachedResult.success && cachedResult.token) {
      return res.status(200).json(cachedResult);
    }
    
    // If we previously encountered an invalid_grant error, return that
    if (cachedResult.error === 'invalid_grant') {
      return res.status(400).json({
        error: 'invalid_grant',
        message: 'Authorization code has expired or already been used'
      });
    }
    
    // For other cases, return the cached result
    return res.status(cachedResult.status || 200).json(cachedResult);
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
      console.log('Client requested JSON response');
      
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
          
          // Create successful result
          const result = {
            success: true,
            token,
            user: {
              id: userInfo.id,
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture
            },
            timestamp: Date.now()
          };
          
          // Cache the successful result
          processedCodes.set(code, result);
          
          // Return success with token
          return res.status(200).json(result);
        } catch (tokenError) {
          console.error('Token exchange error:', tokenError);
          
          // If it's an invalid_grant error, return a specific message
          if (tokenError.message && tokenError.message.includes('invalid_grant')) {
            // Cache the invalid_grant result
            const errorResult = {
              error: 'invalid_grant',
              message: 'Authorization code has expired or already been used',
              timestamp: Date.now(),
              status: 400
            };
            processedCodes.set(code, errorResult);
            
            return res.status(400).json(errorResult);
          }
          
          // For other errors, create a pending result
          const pendingResult = {
            success: false, 
            pending: true,
            message: 'Authentication in progress via background service',
            error: tokenError.message,
            code_partial: code.substring(0, 8) + '...',
            timestamp: Date.now()
          };
          
          // Cache the pending result
          processedCodes.set(code, pendingResult);
          
          return res.status(200).json(pendingResult);
        }
      } catch (directError) {
        console.error('Error in direct handling:', directError);
        
        // Create error result
        const errorResult = {
          success: false, 
          error: 'direct_handling_failed',
          message: 'Error handling authorization code',
          details: directError.message,
          timestamp: Date.now()
        };
        
        // Cache the error result
        processedCodes.set(code, errorResult);
        
        return res.status(200).json(errorResult);
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
          
          // Don't make another request if we already have a token
          if (localStorage.getItem('token')) {
            console.log('Found existing token, redirecting directly');
            window.location.href = redirectUrl;
          } else {
            // Make the request
            fetch(\`https://api.quits.cc/api/auth/google/callback?code=\${encodeURIComponent(code)}&redirect=\${encodeURIComponent(redirectUrl)}&_t=\${timestamp}\`, {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Accept': 'application/json'
              }
            })
            .then(response => {
              if (response.ok) {
                return response.json();
              } else if (response.status === 400) {
                // For 400 errors, redirect to login with error
                window.location.href = '/login?error=invalid_grant&message=Your authorization code has expired. Please try again.';
                throw new Error('Invalid authorization code');
              } else {
                throw new Error('Network response was not ok');
              }
            })
            .then(data => {
              if (data.token) {
                // Store the token
                localStorage.setItem('token', data.token);
                console.log('Token stored successfully');
                
                // Redirect
                window.location.href = redirectUrl;
              } else if (data.error) {
                // Redirect to login with error
                window.location.href = '/login?error=' + data.error + '&message=' + encodeURIComponent(data.message || 'Authentication failed');
              } else {
                // Display error
                document.body.innerHTML = '<h2>Authentication Error</h2><p>' + (data.message || 'Failed to authenticate') + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
              }
            })
            .catch(error => {
              // Display error
              document.body.innerHTML = '<h2>Authentication Error</h2><p>' + error.message + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
            });
          }
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
    
    // Create error result
    const errorResult = {
      error: 'Authentication failed',
      message: error.message,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    };
    
    // Cache the error result
    processedCodes.set(code, {
      ...errorResult,
      timestamp: Date.now()
    });
    
    return res.status(500).json(errorResult);
  }
} 