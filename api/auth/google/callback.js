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

    // Set up the redirect URI - use a consistent one for production, but allow local override
    const productionRedirectUri = 'https://www.quits.cc/auth/callback';
    const localRedirectUri = `http://localhost:3000/api/auth/google/callback`;
    const redirectUri = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production' 
      ? productionRedirectUri
      : localRedirectUri;

    console.log(`Using redirect URI: ${redirectUri}`);
    
    // Check for required environment variables
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('Missing required environment variable: GOOGLE_CLIENT_ID');
    }
    
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Missing required environment variable: GOOGLE_CLIENT_SECRET');
    }
    
    if (!process.env.JWT_SECRET) {
      throw new Error('Missing required environment variable: JWT_SECRET');
    }
    
    // Use environment variables (no hardcoded fallbacks for security)
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    console.log(`Using client ID: ${clientId.substring(0, 5)}****** and redirect URI: ${redirectUri}`);

    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange code for tokens
    let tokens;
    try {
      console.log(`Attempting to exchange authorization code: ${code.substring(0, 5)}******`);
      const response = await oauth2Client.getToken(code);
      tokens = response.tokens;
      console.log('Token exchange successful, received tokens:', Object.keys(tokens).join(', '));
    } catch (tokenError) {
      console.error('Token exchange error:', tokenError.message);
      
      // If it's an invalid_grant error, return a specific message
      if (tokenError.message && tokenError.message.includes('invalid_grant')) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          return res.status(400).json({
            error: 'invalid_grant',
            message: 'Authorization code has expired or already been used',
            error_details: {
              error_type: tokenError.name,
              error_message: tokenError.message,
              redirect_uri: redirectUri
            }
          });
        }
        
        // HTML response for invalid_grant error
        return res.status(400).send(`
          <html>
            <head><title>Authentication Error</title></head>
            <body>
              <h2>Authentication Error</h2>
              <p>Authorization code has expired or already been used.</p>
              <p>Please try logging in again.</p>
              <p><a href="https://www.quits.cc/login">Return to login</a></p>
            </body>
          </html>
        `);
      }
      
      // For other token errors
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(400).json({
          error: 'token_exchange_failed',
          message: tokenError.message,
          error_details: {
            error_type: tokenError.name,
            error_message: tokenError.message,
            redirect_uri: redirectUri
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
            <p><a href="https://www.quits.cc/login">Return to login</a></p>
          </body>
        </html>
      `);
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

    // ------------------------------------------------------------------
    // 1) Link or create Supabase user row
    // ------------------------------------------------------------------

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials in environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional state param for account linking (uid:<uuid>)
    let linkUserId;
    if (typeof req.query.state === 'string' && req.query.state.startsWith('uid:')) {
      const possible = req.query.state.substring(4);
      if (/^[0-9a-fA-F-]{36}$/.test(possible)) {
        linkUserId = possible;
        console.log('[OAuth] Linking Google account to existing user id:', linkUserId);
      }
    }

    // Optionally preserve the existing email if linking
    let emailToStore = userInfo.email;
    if (linkUserId) {
      const { data: existing } = await supabase
        .from('users')
        .select('email')
        .eq('id', linkUserId)
        .single();
      if (existing && existing.email && existing.email !== userInfo.email) {
        console.log('[OAuth] Preserving original account email while linking');
        emailToStore = existing.email;
      }
    }

    // Upsert user row (conflict on id when provided, else email)
    const upsertPayload = {
      ...(linkUserId ? { id: linkUserId } : {}),
      google_id: userInfo.id,
      email: emailToStore,
      name: userInfo.name || emailToStore.split('@')[0],
      avatar_url: userInfo.picture || null,
      updated_at: new Date().toISOString()
    };

    if (!upsertPayload.id) {
      // Ensure deterministic UUID: if user already exists by email attach google_id
      const { data: existingByEmail } = await supabase
        .from('users')
        .select('id, google_id')
        .eq('email', emailToStore)
        .single();
      if (existingByEmail) {
        upsertPayload.id = existingByEmail.id;
      }
    }

    const { data: userRow, error: upsertErr } = await supabase
      .from('users')
      .upsert(upsertPayload, { onConflict: upsertPayload.id ? 'id' : 'email' })
      .select('id')
      .single();

    if (upsertErr) {
      console.error('[OAuth] Failed to upsert user:', upsertErr);
      throw new Error('Database upsert failed');
    }

    console.log('[OAuth] User row ready with id:', userRow.id);

    // ------------------------------------------------------------------
    // 2) Generate application JWT referencing the Supabase user UUID
    // ------------------------------------------------------------------

    console.log('Generating application JWT');
    const jwtSecret = process.env.JWT_SECRET;

    const token = jwt.default.sign(
      {
        id: userRow.id,
        email: emailToStore,
        gmail_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        createdAt: new Date().toISOString(),
        gmail_email: userInfo.email
      },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    console.log('JWT token generated, length:', token.length);

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

    // Generate a random nonce for CSP
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
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
        
        <script nonce="${nonce}">
          // Helper to show debug information
          function debug(message) {
            console.log("[Auth Debug] " + message);
            const debugEl = document.getElementById('debugInfo');
            debugEl.innerHTML += message + '<br>';
            // Auto-scroll to bottom
            debugEl.scrollTop = debugEl.scrollHeight;
          }
          
          // Helper to check localStorage availability
          function isLocalStorageAvailable() {
            try {
              const test = '__test__';
              localStorage.setItem(test, test);
              localStorage.removeItem(test);
              return true;
            } catch(e) {
              return false;
            }
          }
          
          // Helper to store token and ensure it's stored correctly
          function storeToken(token) {
            if (!isLocalStorageAvailable()) {
              debug('ERROR: localStorage is not available in this browser');
              return false;
            }
            
            try {
              // First clear any existing tokens
              localStorage.removeItem('token');
              localStorage.removeItem('quits_auth_token');
              debug("Cleared existing tokens");
              
              // Try to store new token in both places for consistency
              localStorage.setItem('token', token);
              localStorage.setItem('quits_auth_token', token);
              debug("Set new token in both locations");
              
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
    // Allow scripts with the nonce
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://www.quits.cc https://api.quits.cc`);
    console.log('Sending HTML response with token');
    return res.send(htmlResponse);

  } catch (error) {
    console.error('OAuth callback error:', error.message);
    console.error('Error stack:', error.stack);
    
    // Environment variables debug info object
    const envInfo = {
      has_google_client_id: !!process.env.GOOGLE_CLIENT_ID,
      has_google_client_secret: !!process.env.GOOGLE_CLIENT_SECRET,
      has_jwt_secret: !!process.env.JWT_SECRET,
      node_env: process.env.NODE_ENV || 'not set',
      vercel_env: process.env.VERCEL_ENV || 'not set'
    };
    
    // Log environment info for debugging
    console.error('Environment info:', envInfo);
    
    // Return appropriate format based on Accept header
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({
        error: 'authentication_failed',
        message: error.message,
        details: process.env.NODE_ENV === 'production' ? undefined : error.stack,
        env_info: envInfo
      });
    }
    
    // HTML error response
    return res.status(500).send(`
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <h2>Authentication Error</h2>
          <p>${error.message}</p>
          <p>We encountered an error processing your authentication.</p>
          <p><a href="https://www.quits.cc/login">Return to login</a></p>
        </body>
      </html>
    `);
  }
} 