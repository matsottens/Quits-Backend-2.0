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
}, 3600000);

export default async function handler(req, res) {
  // Always set CORS headers explicitly for all response types
  setCorsHeaders(req, res);
  
  // Add special security headers
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Add no-cache headers to prevent caching issues
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  // Add explicit CORS headers (redundant but being extra safe)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
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
  
  // Debug environment variables
  console.log('ENVIRONMENT DIAGNOSTICS:');
  console.log('CLIENT_URL:', process.env.CLIENT_URL);
  console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
  console.log('GOOGLE_CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET present:', !!process.env.GOOGLE_CLIENT_SECRET);
  console.log('JWT_SECRET present:', !!process.env.JWT_SECRET);
  
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
    console.log('Using cached result for authorization code:', {
      code_partial: code.substring(0, 8) + '...',
      result_type: cachedResult.error ? 'error' : 'success',
      timestamp_age: Date.now() - cachedResult.timestamp,
      status: cachedResult.status || 200
    });
    
    // Return the cached result with the original status code
    return res.status(cachedResult.status || 200).json(cachedResult);
  }
  
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
          
          const jwtPayload = { 
            id: userInfo.id,
            email: userInfo.email,
            gmail_token: tokens.access_token,
            createdAt: new Date().toISOString()
          };
          
          const token = jwt.default.sign(
            jwtPayload,
            jwtSecret,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
          processedCodes.set(code, result);
          
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
            processedCodes.set(code, errorResult);
            
            return res.status(400).json(errorResult);
          }
          
          // Try alternate redirect URIs if primary fails and it's not an invalid_grant error
          console.log('Trying alternate redirect URIs');
          const alternateUris = [
            'https://quits.cc/auth/callback',
            'https://www.quits.cc/dashboard',
            redirect ? decodeURIComponent(redirect) : 'https://www.quits.cc/dashboard'
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
              processedCodes.set(code, successResult);
              
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
          processedCodes.set(code, errorResult);
          
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
        processedCodes.set(code, errorResult);
        
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
          const redirectUrl = "${redirect || 'https://www.quits.cc/dashboard'}";
          const timestamp = Date.now();
          
          debug('Auth code: ' + code.substring(0, 8) + '...');
          debug('Redirect URL: ' + redirectUrl);
          debug('User Agent: ' + navigator.userAgent);
          debug('Browser: ' + (navigator.userAgentData ? navigator.userAgentData.brands.map(b => b.brand + ' ' + b.version).join(', ') : 'Not available'));
          
          // First check if localStorage is available
          if (!isLocalStorageAvailable()) {
            debug('ERROR: localStorage is not available in this browser/context');
            document.body.innerHTML = '<h2>Authentication Error</h2><p>Your browser does not support or allow localStorage, which is required for authentication.</p><p>Please enable cookies and localStorage for this site.</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
          } else {
            debug('localStorage is available');
            
            // Check if we already have a token
            const existingToken = localStorage.getItem('token');
            if (existingToken) {
              debug('Found existing token, redirecting directly');
              window.location.href = redirectUrl;
            } else {
              debug('No existing token found, making API request');
              
              // Make the request
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
                  debug('Token received, length: ' + data.token.length);
                  
                  // Store the token and verify it was stored
                  const stored = storeToken(data.token);
                  
                  if (stored) {
                    debug('Token stored successfully. Performing double-check...');
                    
                    // Double-check the token storage after a brief delay
                    setTimeout(() => {
                      const doubleCheck = localStorage.getItem('token');
                      if (doubleCheck === data.token) {
                        debug('Double-check passed! Token persistence confirmed.');
                        debug('Redirecting to: ' + redirectUrl);
                        
                        // Use another slight delay before redirecting
                        setTimeout(() => {
                          window.location.href = redirectUrl;
                        }, 200);
                      } else {
                        debug('ERROR: Double-check failed! Token was lost or changed.');
                        document.body.innerHTML = '<h2>Authentication Error</h2><p>Failed to reliably store authentication token. Please ensure cookies and localStorage are enabled.</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
                      }
                    }, 300);
                  } else {
                    debug('Failed to store token, showing error');
                    document.body.innerHTML = '<h2>Authentication Error</h2><p>Failed to store authentication token. Please ensure cookies and localStorage are enabled.</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
                  }
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
                // Display error
                document.body.innerHTML = '<h2>Authentication Error</h2><p>' + error.message + '</p><p><a href="https://www.quits.cc/login">Return to login</a></p>';
              });
            }
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
    console.error('Error stack:', error.stack);
    
    // Create error result
    const errorResult = {
      success: false,
      error: 'auth_failed',
      message: 'Authentication failed. Please try again.',
      details: process.env.NODE_ENV === 'production' ? error.message : error.stack,
      timestamp: Date.now(),
      status: 500
    };
    
    // Cache the error result
    processedCodes.set(code, {
      ...errorResult,
      timestamp: Date.now()
    });
    
    return res.status(500).json(errorResult);
  }
} 