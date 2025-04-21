// Google OAuth Proxy - Simplified handler to avoid path-to-regexp issues
import { setCorsHeaders, getPath } from './utils.js';
import fetch from 'node-fetch';

// Use node-fetch for older Node.js environments
const fetchNode = globalThis.fetch || fetch;

// Simple in-memory rate limiting cache to prevent duplicate requests
const requestCache = new Map();

// Clean cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > 60000) { // Remove entries older than 1 minute
      requestCache.delete(key);
    }
  }
}, 60000);

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for Google proxy');
    return res.status(204).end();
  }
  
  const path = getPath(req);
  console.log('Google Proxy Handler - Processing request for path:', path);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  console.log('Query params:', req.query);
  
  // Debug environment variables
  console.log('ENVIRONMENT DIAGNOSTICS:');
  console.log('CLIENT_URL:', process.env.CLIENT_URL);
  console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
  console.log('GOOGLE_CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET present:', !!process.env.GOOGLE_CLIENT_SECRET);
  console.log('JWT_SECRET present:', !!process.env.JWT_SECRET);
  
  // Rate limiting - Track requests by IP and authorization code to prevent spam
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const requestKey = `${clientIp}-${req.query.code || 'nocode'}-${Date.now()}`;
  
  // Check if this IP or code has made too many requests recently
  const recentRequests = Array.from(requestCache.keys())
    .filter(key => key.startsWith(`${clientIp}-`) && 
            Date.now() - requestCache.get(key).timestamp < 60000); // Requests in the last minute
            
  if (recentRequests.length > 10) {
    console.log(`Rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).json({
      success: false,
      error: 'rate_limit_exceeded',
      message: 'Too many authentication attempts. Please try again later.',
      timestamp: Date.now()
    });
  }
  
  // Cache key for this specific request
  const cacheKey = `${clientIp}-${req.query.code || 'nocode'}-${path}`;
  
  // Check if this exact request is already cached
  const cachedResult = requestCache.get(cacheKey);
  if (cachedResult && Date.now() - cachedResult.timestamp < 30000) { // 30 seconds cache
    console.log('Returning cached result for request', cacheKey);
    return res.status(cachedResult.status).json(cachedResult.data);
  }
  
  // Get the authorization code
  const code = req.query.code;
  
  // Validate required parameters
  if (!code) {
    const errorResult = {
      success: false,
      error: 'missing_code',
      message: 'Authorization code is required',
      timestamp: Date.now()
    };
    
    // Cache the error result
    requestCache.set(cacheKey, {
      status: 400,
      data: errorResult,
      timestamp: Date.now()
    });
    
    return res.status(400).json(errorResult);
  }
  
  // Track if this was an invalid_grant error to prevent multiple backend attempts
  let hadInvalidGrantError = false;
  
  try {
    // Log all request headers for debugging
    console.log('Request headers:', req.headers);
    
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
        
        // Debug environment variables
        console.log('Environment variables:');
        console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `Set (length: ${process.env.GOOGLE_CLIENT_ID.length})` : 'Not set');
        console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? `Set (length: ${process.env.GOOGLE_CLIENT_SECRET.length})` : 'Not set');
        console.log('JWT_SECRET:', process.env.JWT_SECRET ? `Set (length: ${process.env.JWT_SECRET.length})` : 'Not set');
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
        
        // Use environment variables with fallbacks
        const clientId = process.env.GOOGLE_CLIENT_ID || '82730443897-ji64k4jhk02lonkps5vu54e1q5opoq3g.apps.googleusercontent.com';
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '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';
        const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-key';
        
        // Create OAuth client
        console.log(`Creating OAuth client with redirect URI: ${redirectUri}`);
        console.log(`Using client ID: ${clientId.substring(0, 10)}...`);
        
        const oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          redirectUri
        );
        
        // Try to exchange the auth code for tokens
        try {
          console.log(`Attempting to exchange authorization code: ${code.substring(0, 10)}...`);
          
          const response = await oauth2Client.getToken(code);
          console.log('Token exchange successful');
          const tokens = response.tokens;
          
          // Get user info
          oauth2Client.setCredentials(tokens);
          const oauth2 = google.oauth2('v2');
          console.log('Getting user info with access token');
          const userInfoResponse = await oauth2.userinfo.get({
            auth: oauth2Client,
          });
          const userInfo = userInfoResponse.data;
          
          console.log('User info retrieved successfully:', userInfo.email);
          
          if (!userInfo.id || !userInfo.email) {
            throw new Error('Failed to retrieve user information');
          }
          
          // Generate a JWT token
          const jwt = await import('jsonwebtoken');
          console.log('Generating JWT token');
          
          const token = jwt.default.sign(
            {
              id: userInfo.id,
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture,
              gmail_token: tokens.access_token,
              refresh_token: tokens.refresh_token || null,
              token_type: tokens.token_type || 'Bearer',
              scope: tokens.scope || null,
              id_token: tokens.id_token || null,
              expiry_date: tokens.expiry_date || null,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 // 30 days
            },
            jwtSecret
          );
          
          console.log('JWT token generated successfully, length:', token.length);
          
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
          requestCache.set(cacheKey, {
            status: 200,
            data: result,
            timestamp: Date.now()
          });
          
          console.log('Sending success response with token');
          
          // Return success with token
          return res.status(200).json(result);
        } catch (tokenError) {
          console.error('Token exchange error:', tokenError);
          console.error('Token error name:', tokenError.name);
          console.error('Token error message:', tokenError.message);
          console.error('Token exchange error details:', tokenError.response?.data || 'No additional details');
          
          // Log more details about the error if available
          if (tokenError.response && tokenError.response.data) {
            console.error('Error response data:', JSON.stringify(tokenError.response.data));
            console.error('Error status:', tokenError.response.status);
            console.error('Error headers:', JSON.stringify(tokenError.response.headers));
          }
          
          // If it's an invalid_grant error, return a specific message
          if (tokenError.message && tokenError.message.includes('invalid_grant')) {
            console.log('Invalid grant error detected - authorization code expired or already used');
            // Cache the invalid_grant result
            const errorResult = {
              success: false,
              error: 'invalid_grant',
              message: 'Authorization code has expired or already been used',
              timestamp: Date.now(),
              status: 400,
              error_details: {
                code_partial: code.substring(0, 10) + '...',
                error_type: tokenError.name,
                error_message: tokenError.message,
                redirect_uri: redirectUri
              }
            };
            requestCache.set(cacheKey, {
              status: 400,
              data: errorResult,
              timestamp: Date.now()
            });
            
            return res.status(400).json(errorResult);
          }
          
          // Try alternate redirect URIs if primary fails and it's not an invalid_grant error
          console.log('Trying alternate redirect URIs');
          const alternateUris = [
            'https://quits.cc/auth/callback',
            'https://www.quits.cc/dashboard',
            req.query.redirect_uri ? decodeURIComponent(req.query.redirect_uri) : 'https://www.quits.cc/dashboard'
          ];
          
          for (const uri of alternateUris) {
            try {
              console.log(`Trying with alternate redirect URI: ${uri}`);
              const altOAuth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                uri
              );
              const altResponse = await altOAuth2Client.getToken(code);
              console.log(`Success with alternate URI: ${uri}`);
              
              // Process the successful response
              const altTokens = altResponse.tokens;
              altOAuth2Client.setCredentials(altTokens);
              const altOauth2 = google.oauth2('v2');
              const altUserInfoResponse = await altOauth2.userinfo.get({
                auth: altOAuth2Client,
              });
              const altUserInfo = altUserInfoResponse.data;
              
              // Generate JWT
              const jwtModule = await import('jsonwebtoken');
              const altToken = jwtModule.default.sign(
                { 
                  id: altUserInfo.id,
                  email: altUserInfo.email,
                  gmail_token: altTokens.access_token,
                  createdAt: new Date().toISOString()
                },
                jwtSecret,
                { expiresIn: '7d' }
              );
              
              // Create successful result
              const successResult = {
                success: true,
                token: altToken,
                user: {
                  id: altUserInfo.id,
                  email: altUserInfo.email,
                  name: altUserInfo.name,
                  picture: altUserInfo.picture
                },
                timestamp: Date.now()
              };
              
              // Cache the successful result
              requestCache.set(cacheKey, {
                status: 200,
                data: successResult,
                timestamp: Date.now()
              });
              
              return res.status(200).json(successResult);
            } catch (altError) {
              console.log(`Failed with URI ${uri}:`, altError.message);
            }
          }
          
          // For other errors, create a pending result
          console.log('All redirect URIs failed, returning auth_failed error');
          const errorResult = {
            success: false, 
            error: 'auth_failed',
            message: 'Failed to authenticate with Google. Please try again.',
            details: tokenError.message,
            timestamp: Date.now(),
            status: 400,
            error_details: {
              code_partial: code.substring(0, 10) + '...',
              tried_uris: alternateUris,
              error_type: tokenError.name,
              error_message: tokenError.message
            }
          };
          
          // Cache the error result
          requestCache.set(cacheKey, {
            status: 400,
            data: errorResult,
            timestamp: Date.now()
          });
          
          return res.status(400).json(errorResult);
        }
      } catch (directError) {
        console.error('Error in direct handling:', directError);
        console.error('Details:', directError.stack);
        
        // Create error result
        const errorResult = {
          success: false, 
          error: 'direct_handling_failed',
          message: 'Error handling authorization code',
          details: directError.message,
          timestamp: Date.now(),
          stack: directError.stack
        };
        
        // Cache the error result
        requestCache.set(cacheKey, {
          status: 500,
          data: errorResult,
          timestamp: Date.now()
        });
        
        return res.status(500).json(errorResult);
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
          #debugInfo { background: #f8f8f8; border: 1px solid #ddd; margin-top: 30px; padding: 10px; text-align: left; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto; }
        </style>
      </head>
      <body>
        <h2>Authenticating with Google</h2>
        <div class="loader"></div>
        <p>Please wait while we complete your authentication...</p>
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
              debug("Starting token storage process");
              
              // First clear any existing tokens
              localStorage.removeItem('token');
              localStorage.removeItem('quits_auth_token');
              debug("Cleared existing tokens");
              
              // Try to store new token in both places for consistency
              localStorage.setItem('token', token);
              localStorage.setItem('quits_auth_token', token);
              debug("Attempted to set new token in both locations");
              
              // Verify token was stored correctly in both places
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
              
              if (storedToken !== token) {
                debug('ERROR: Token verification failed - stored value does not match');
                return false;
              }
              
              debug('Token stored successfully and verified');
              return true;
            } catch (e) {
              debug('ERROR: Exception storing token: ' + e.message);
              return false;
            }
          }
          
          // Check if localStorage is available
          function isLocalStorageAvailable() {
            try {
              const test = 'test';
              localStorage.setItem(test, test);
              const result = localStorage.getItem(test) === test;
              localStorage.removeItem(test);
              return result;
            } catch (e) {
              return false;
            }
          }
          
          // Forward the request to the main callback handler
          const code = "${code}";
          const redirectUrl = "${req.query.redirect_uri || 'https://www.quits.cc/dashboard'}";
          const timestamp = Date.now();
          const token = "${token || ''}";
          
          debug('Auth code: ' + code.substring(0, 8) + '...');
          debug('Redirect URL: ' + redirectUrl);
          
          // First check if we already got a token directly
          if (token) {
            debug('Token received directly, length: ' + token.length);
            
            // Try localStorage if available, but don't require it
            if (isLocalStorageAvailable()) {
              debug('localStorage is available, storing token');
              storeToken(token);
            } else {
              debug('WARNING: localStorage is not available, continuing anyway with URL token');
            }
            
            // Redirect with token as query parameter
            debug('Redirecting to app with token in URL');
            window.location.href = redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
          } else {
            debug('No direct token provided, using API call');
            
            // Make the request to get a token
            fetch(\`https://api.quits.cc/api/auth/google/callback?code=\${encodeURIComponent(code)}&redirect=\${encodeURIComponent(redirectUrl)}&_t=\${timestamp}\`, {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store'
              }
            })
            .then(response => {
              debug('Response received with status: ' + response.status);
              if (response.ok) {
                debug('Response OK, parsing JSON');
                return response.json();
              } else if (response.status === 400) {
                debug('Error 400 received, redirecting to login with error');
                window.location.href = '/login?error=invalid_grant&message=Your authorization code has expired. Please try again.';
                throw new Error('Invalid authorization code');
              } else {
                debug('Network error: ' + response.status);
                throw new Error('Network response was not ok: ' + response.status);
              }
            })
            .then(data => {
              debug('Response data received: ' + (data ? JSON.stringify(data).substring(0, 100) + '...' : 'null'));
              
              if (data && data.token) {
                debug('Token received from API, length: ' + data.token.length);
                
                // Try localStorage if available
                let stored = false;
                if (isLocalStorageAvailable()) {
                  debug('localStorage is available, storing token');
                  stored = storeToken(data.token);
                  debug('Token storage result: ' + (stored ? 'success' : 'failed'));
                } else {
                  debug('WARNING: localStorage is not available');
                }
                
                // Redirect with token as query parameter (regardless of localStorage)
                debug('Redirecting to app with token in URL');
                window.location.href = redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(data.token);
              } else if (data && data.error) {
                debug('Error in response: ' + data.error);
                // Redirect to login with error
                window.location.href = '/login?error=' + data.error + '&message=' + encodeURIComponent(data.message || 'Authentication failed');
              } else {
                debug('No token or error in response: ' + JSON.stringify(data));
                // Display error
                document.body.innerHTML = '<h2>Authentication Error</h2><p>' + (data && data.message ? data.message : 'Failed to authenticate') + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
              }
            })
            .catch(error => {
              debug('Fetch error: ' + error.message);
              // Check for known error types in the error message
              if (error.message.includes('invalid_grant') || error.message.includes('expired')) {
                debug('Identified as invalid_grant error, redirecting to login');
                window.location.href = '/login?error=invalid_grant&message=' + encodeURIComponent('Your authorization has expired. Please try again.');
              } else {
                // Display generic error for other cases
                document.body.innerHTML = '<h2>Authentication Error</h2><p>' + error.message + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
              }
            });
          }
        </script>
      </body>
      </html>
    `;
    
    // Check if JSON response was explicitly requested
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      // For JSON requests, return the token directly in the response
      if (token) {
        console.log('Returning JSON response with token');
        return res.status(200).json({
          success: true,
          token: token,
          redirect: req.query.redirect_uri || 'https://www.quits.cc/dashboard'
        });
      } else if (error) {
        console.log('Returning JSON error response');
        return res.status(400).json({
          success: false,
          error: error.code || 'auth_error',
          message: error.message || 'Authentication failed',
          details: error.details || null
        });
      }
    }
    
    // For all other requests, return HTML
    // Set response headers for HTML
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Security-Policy', "default-src 'self' https://api.quits.cc https://www.quits.cc; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    
    // Return the HTML
    return res.send(htmlResponse);
  } catch (error) {
    console.error('Error exchanging authorization code:', error);
    
    // Handle specific error types
    if (error.message && error.message.includes('invalid_grant')) {
      console.log('Invalid grant error detected, preventing backend processing');
      hadInvalidGrantError = true;
      
      // Create error response for invalid_grant
      const errorResponse = {
        success: false,
        error: 'invalid_grant',
        message: 'Your authorization code has expired or already been used. Please try again.',
        details: error.message,
        timestamp: Date.now()
      };
      
      // Cache the error result with a longer expiration to prevent repeated attempts
      requestCache.set(cacheKey, {
        status: 400,
        data: errorResponse,
        timestamp: Date.now()
      });
      
      // Check if JSON response was requested
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(400).json(errorResponse);
      }
      
      // Provide HTML response with redirection for browser requests
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
          </style>
        </head>
        <body>
          <h2>Authentication Error</h2>
          <p>${errorResponse.message}</p>
          <p><a href="https://www.quits.cc/login">Return to login</a></p>
          <script>
            // Redirect automatically after 2 seconds
            setTimeout(function() {
              window.location.href = 'https://www.quits.cc/login?error=invalid_grant&message=${encodeURIComponent(errorResponse.message)}';
            }, 2000);
          </script>
        </body>
        </html>
      `);
    }
    
    // For all other errors, return a generic error response
    const genericErrorResponse = {
      success: false,
      error: 'auth_error',
      message: 'An error occurred during authentication. Please try again.',
      details: error.message,
      timestamp: Date.now()
    };
    
    // Cache the error
    requestCache.set(cacheKey, {
      status: 500,
      data: genericErrorResponse,
      timestamp: Date.now()
    });
    
    // Check if JSON response was requested
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json(genericErrorResponse);
    }
    
    // Provide HTML error response with redirection for browser requests
    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Authentication Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
        </style>
      </head>
      <body>
        <h2>Authentication Error</h2>
        <p>${genericErrorResponse.message}</p>
        <p><a href="https://www.quits.cc/login">Return to login</a></p>
        <script>
          // Redirect automatically after 3 seconds
          setTimeout(function() {
            window.location.href = 'https://www.quits.cc/login?error=auth_error&message=${encodeURIComponent(genericErrorResponse.message)}';
          }, 3000);
        </script>
      </body>
      </html>
    `);
  }
} 