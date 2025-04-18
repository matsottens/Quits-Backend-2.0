import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import { google } from 'googleapis';
import { oauth2Client, SCOPES } from '../config/google.js';
import { supabase } from '../config/supabase.js';
import { authenticateUser, AuthRequest } from '../middleware/auth.js';
import { generateToken } from '../utils/jwt.js';
import { upsertUser } from '../services/database.js';

const router = express.Router();

// Simple test endpoint to verify that routes are reachable
router.get('/test', ((req: Request, res: Response) => {
  res.json({
    message: 'Auth routes are working properly!',
    origin: req.headers.origin,
    time: new Date().toISOString()
  });
}) as RequestHandler);

// Add a direct route for testing direct2 endpoint
router.post('/google/callback/direct2-test', (req: Request, res: Response) => {
  console.log('Direct2-test route hit with body:', req.body);
  res.json({
    message: 'Direct2-test route is accessible!',
    origin: req.headers.origin,
    body: req.body,
    headers: req.headers,
    time: new Date().toISOString()
  });
});

// Add a direct route for GET requests to test CORS
router.get('/google/callback/direct2-test', (req: Request, res: Response) => {
  console.log('GET Direct2-test route hit with query:', req.query);
  res.json({
    message: 'GET Direct2-test route is accessible!',
    origin: req.headers.origin,
    query: req.query,
    headers: req.headers,
    time: new Date().toISOString()
  });
});

// Add a simple test endpoint specifically for testing the direct2 route
router.post('/google/callback/direct2-test', (req: Request, res: Response) => {
  res.json({
    message: 'Direct2 test route is accessible!',
    origin: req.headers.origin,
    body: req.body,
    time: new Date().toISOString()
  });
});

// Get Google OAuth URL
router.get('/google', (req: Request, res: Response) => {
  try {
    // Dynamically set the redirect URI based on the request origin
    const origin = req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
    console.log('OAuth URL generator called with origin:', origin);
    
    // Use the same origin format (www or non-www) for consistency
    const redirectUri = `${origin}/auth/callback`;
    console.log('Using redirect URI:', redirectUri);

    // Create a new OAuth2 client instance for this request to set the specific redirect URI
    // This is important if the base oauth2Client doesn't have a redirect URI set
    const requestSpecificOauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const url = requestSpecificOauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force consent screen for refresh token
      include_granted_scopes: true
    });
    
    res.json({ url });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Extract the callback handler to a separate function for reuse
const handleGoogleCallback: RequestHandler = async (req: Request, res: Response) => {
  try {
    console.log('Attempting to handle callback with path:', req.path);
    const { code, error: oauthError, callback, redirect } = req.query;

    console.log('Auth callback request received:', {
      path: req.path,
      originalUrl: req.originalUrl,
      origin: req.headers.origin,
      referer: req.headers.referer,
      hasCode: !!code,
      hasRedirect: !!redirect
    });

    // Set CORS headers for all responses
    const requestOrigin = req.headers.origin || '';
    if (requestOrigin && (requestOrigin.includes('quits.cc') || requestOrigin.includes('localhost'))) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    }

    // Handle JSONP callback if provided (for alternative auth methods)
    const isJsonp = typeof callback === 'string' && callback.length > 0;

    if (oauthError) {
        console.error('Google OAuth Error on callback:', oauthError);
        
        if (isJsonp) {
          return res.send(`${callback}({"error": "google_oauth_failed", "details": "${oauthError}"})`);
        }
        
        // Redirect back to frontend with error
        const redirectUrl = typeof redirect === 'string' && redirect.length > 0
          ? redirect
          : req.headers.referer?.split('?')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
          
        return res.redirect(`${redirectUrl.replace('/auth/callback','/login')}?error=google_oauth_failed&details=${oauthError}`);
    }

    if (!code || typeof code !== 'string') {
      console.error('Authorization code is required.');
      
      if (isJsonp) {
        return res.send(`${callback}({"error": "missing_code"})`);
      }
      
      const redirectUrl = typeof redirect === 'string' && redirect.length > 0
        ? redirect
        : req.headers.referer?.split('?')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
        
      return res.redirect(`${redirectUrl.replace('/auth/callback','/login')}?error=missing_code`);
    }

    // Determine the redirect URI used by the client for this specific request
    // Handle both www and non-www versions
    let origin = req.headers.origin || req.headers.referer?.split('/auth/callback')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
    
    // Normalize the origin to handle both www and non-www versions
    if (origin.includes('quits.cc')) {
      // For Google OAuth, we need to use the registered redirect URI
      origin = 'https://quits.cc';
    }
    
    const redirectUri = `${origin}/auth/callback`;

    console.log(`Using redirect URI for token exchange: ${redirectUri}`);

    // Create a new OAuth2 client instance FOR TOKEN EXCHANGE
    const tokenExchangeOauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );

    console.log('Received auth code, attempting to exchange for tokens...');
    const { tokens } = await tokenExchangeOauth2Client.getToken(code as string);
    console.log('Tokens received:', tokens.access_token ? 'Yes (access token)' : 'No', tokens.refresh_token ? 'Yes (refresh token)' : 'No');
    
    // Set credentials on the client for subsequent API calls
    tokenExchangeOauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2('v2');
    const userInfoResponse = await oauth2.userinfo.get({
      auth: tokenExchangeOauth2Client,
    });
    const userInfo = userInfoResponse.data;

    console.log('User Info from Google:', userInfo.email);
    if (!userInfo.id || !userInfo.email) {
        throw new Error('Failed to retrieve user ID or email from Google.');
    }

    // Create or update user in database
    const user = await upsertUser({
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        verified_email: userInfo.verified_email
    });
    console.log('User upserted in DB:', user.email);

    // Store tokens securely
    const { error: tokenStoreError } = await supabase
      .from('user_tokens')
      .upsert({
          user_id: user.id,
          provider: 'google',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token, 
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          scopes: tokens.scope
      }, { onConflict: 'user_id, provider' });

    if (tokenStoreError) {
        console.error('Error storing user tokens:', tokenStoreError);
    }

    // Generate JWT token for your application's session
    const appTokenPayload = { id: user.id, email: user.email };
    const appToken = generateToken(appTokenPayload);

    console.log('App token generated.');
    
    // Handle JSONP response if callback provided
    if (isJsonp) {
      const responseData = {
        token: appToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      };
      return res.send(`${callback}(${JSON.stringify(responseData)})`);
    }
    
    // For regular API response, send JSON
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        token: appToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    }
    
    // Otherwise, redirect user back to the frontend with the token
    // Use the redirect parameter if provided, otherwise determine based on referer
    const clientRedirectUrl = typeof redirect === 'string' && redirect.length > 0
      ? redirect
      : redirectUri.replace('/auth/callback', '/dashboard'); // Default fallback
      
    // Include the app token in the redirect URL
    return res.redirect(`${clientRedirectUrl}?token=${appToken}`);

  } catch (error: any) {
    console.error('Google OAuth Callback Error:', error.response?.data || error.message);
    
    // Handle JSONP error response if callback was provided
    const callback = req.query.callback;
    if (typeof callback === 'string' && callback.length > 0) {
      return res.send(`${callback}({"error": "auth_failed", "message": ${JSON.stringify(error.message)}})`);
    }
    
    // Get redirect URL
    const redirect = req.query.redirect;
    const clientOrigin = typeof redirect === 'string' && redirect.length > 0
      ? redirect
      : req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
      
    // Redirect back to frontend login with a generic error
    const loginUrl = `${clientOrigin}/login`;
    let errorCode = 'google_auth_failed';
    if (error.response?.data?.error === 'redirect_uri_mismatch') {
        errorCode = 'redirect_uri_mismatch';
    } else if (error.response?.data?.error === 'invalid_grant') {
        errorCode = 'invalid_grant'; // Often means code expired or already used
    }
    return res.redirect(`${loginUrl}?error=${errorCode}`);
  }
};

// Handle Google OAuth callback - explicitly catch all possible URL patterns
// Replace the problematic wildcard pattern with specific routes
router.get('/google/callback', handleGoogleCallback);
router.get('/auth/google/callback', handleGoogleCallback);
router.get('/api/auth/google/callback', handleGoogleCallback);

// JSONP endpoint for Google OAuth callback (used as a fallback for CORS issues)
router.get('/google/callback/jsonp', (async (req: Request, res: Response) => {
  try {
    const { code, callback } = req.query;
    const origin = req.headers.origin || '';
    
    console.log('JSONP endpoint called with origin:', origin);
    
    if (!callback || typeof callback !== 'string') {
      return res.status(400).json({ error: 'Callback parameter is required for JSONP' });
    }
    
    if (!code || typeof code !== 'string') {
      return res.send(`${callback}({"error": "missing_code"})`);
    }
    
    console.log('JSONP callback received with code:', code.substring(0, 10) + '...');
    
    // Set CORS headers explicitly - allow both www and non-www
    res.header('Access-Control-Allow-Origin', origin.includes('quits.cc') ? origin : '*'); 
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Content-Type', 'application/javascript; charset=utf-8');
    
    // Process the same way as the regular callback
    try {
      // Create redirect URI that matches the one used for the initial authorization
      const redirectUri = origin.includes('www.quits.cc') 
        ? 'https://www.quits.cc/auth/callback' 
        : 'https://quits.cc/auth/callback';
      
      console.log('Using redirect URI for JSONP token exchange:', redirectUri);
      
      const tokenExchangeOauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );
      
      const { tokens } = await tokenExchangeOauth2Client.getToken(code);
      tokenExchangeOauth2Client.setCredentials(tokens);
      
      // Get user info
      const oauth2 = google.oauth2('v2');
      const userInfoResponse = await oauth2.userinfo.get({
        auth: tokenExchangeOauth2Client,
      });
      const userInfo = userInfoResponse.data;
      
      if (!userInfo.id || !userInfo.email) {
        return res.send(`${callback}({"error": "Failed to retrieve user info"})`);
      }
      
      // Create or update user
      const user = await upsertUser({
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        verified_email: userInfo.verified_email
      });
      
      // Store tokens
      await supabase
        .from('user_tokens')
        .upsert({
          user_id: user.id,
          provider: 'google',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          scopes: tokens.scope
        }, { onConflict: 'user_id, provider' });
      
      // Generate app token
      const appTokenPayload = { id: user.id, email: user.email };
      const appToken = generateToken(appTokenPayload);
      
      // Return JSONP response
      const responseData = {
        token: appToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      };
      
      return res.send(`${callback}(${JSON.stringify(responseData)})`);
    } catch (error: any) {
      console.error('JSONP OAuth error:', error.message);
      return res.send(`${callback}({"error": "auth_failed", "message": ${JSON.stringify(error.message)}})`);
    }
  } catch (error: any) {
    console.error('JSONP route error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}) as RequestHandler);

// Direct form-based callback endpoint with redirect back (CSP-friendly)
router.post('/google/callback/direct2', (async (req: Request, res: Response) => {
  try {
    const origin = req.headers.origin || '';
    console.log('Direct2 route hit with origin:', origin);
    
    // Always allow www.quits.cc and quits.cc - this is crucial
    if (origin.includes('quits.cc')) {
      console.log('Setting CORS headers for origin:', origin);
      // Set CORS headers very explicitly
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    } else {
      console.warn('Request from unknown origin:', origin);
    }
    
    // Force logging of request details
    console.log('Request details:', {
      headers: req.headers,
      body: req.body,
      responseHeaders: res.getHeaders()
    });
    
    // Mock successful authentication response
    return res.status(200).json({
      success: true,
      message: 'Direct2 authentication successful',
      token: 'mock-auth-token-' + Date.now(),
      user: {
        id: 'mock-user-id',
        email: 'mock-user@example.com',
        name: 'Mock User'
      }
    });
  } catch (error: any) {
    console.error('Error in direct2 endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}) as RequestHandler);

// Create another version of the direct2 route to try as a fallback
router.post('/google/callback/direct-alt', 
  express.urlencoded({ extended: true }),
  (async (req: Request, res: Response) => {
    try {
      const origin = req.headers.origin;
      console.log('Direct-alt route hit with origin:', origin);
      
      // Ensure CORS headers are set (redundant with global middleware, but belt-and-suspenders approach)
      if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      
      const { code, origin: bodyOrigin, requestId, redirectUri: providedRedirectUri } = req.body;
      
      console.log('Direct-alt fallback route hit with body:', req.body);
      
      // Simple success response - no processing for now
      return res.json({
        success: true,
        message: 'Direct-alt fallback route is working!',
        token: 'sample-token-for-testing',
        user: {
          id: 'sample-id',
          email: 'sample@example.com',
          name: 'Sample User',
          picture: 'https://example.com/sample.jpg'
        },
        time: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Direct-alt fallback route error:', error);
      return res.status(500).json({ error: 'Server error during authentication' });
    }
  }) as RequestHandler
);

// Get user profile (Protected Route)
router.get('/me', 
  authenticateUser as RequestHandler,
  (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Fetch user details from your database (e.g., users table)
      const { data: userProfile, error } = await supabase
        .from('users') // Use 'users' table based on database.ts
        .select('id, email, name, avatar_url')
        .eq('id', userId)
        .single();

      if (error || !userProfile) {
          console.error('Error fetching user profile:', error);
          return res.status(404).json({ error: 'User profile not found' });
      }

      res.json(userProfile);
    } catch (error) {
      console.error('Error fetching /me:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  }) as RequestHandler
);

// Example Logout (optional - depends on session management)
router.post('/logout',
  authenticateUser as RequestHandler,
  (async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // If storing tokens, maybe revoke them or remove them from DB
        const { error: deleteTokenError } = await supabase
            .from('user_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('provider', 'google');

        if (deleteTokenError) {
            console.warn('Could not delete user tokens on logout:', deleteTokenError);
        }
        
        // Clear any session cookies if using them

        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
  }) as RequestHandler
);

// Handle OPTIONS requests for the Google callback specifically
router.options('/google/callback', ((req: Request, res: Response) => {
  const origin = req.headers.origin || '';
  console.log('OPTIONS request for /google/callback with origin:', origin);
  
  // Always allow quits.cc origins
  if (origin.includes('quits.cc') || origin.includes('localhost')) {
    console.log('Setting CORS headers for OPTIONS request with origin:', origin);
    // Set CORS headers very explicitly
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
  } else {
    console.warn('OPTIONS request from unknown origin:', origin);
  }
  
  // Log all headers
  console.log('Response headers for OPTIONS:', res.getHeaders());
  
  // Always respond with 200 OK for OPTIONS
  return res.status(200).end();
}) as RequestHandler);

// Handle OPTIONS requests for the direct2 endpoint
router.options('/google/callback/direct2', ((req: Request, res: Response) => {
  const origin = req.headers.origin || '';
  console.log('OPTIONS request for direct2 with origin:', origin);
  
  // Always allow www.quits.cc and quits.cc origins
  if (origin.includes('quits.cc')) {
    console.log('Setting CORS headers for OPTIONS request with origin:', origin);
    // Set CORS headers very explicitly
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
  } else {
    console.warn('OPTIONS request from unknown origin:', origin);
  }
  
  // Log all headers
  console.log('Response headers for OPTIONS:', res.getHeaders());
  
  // Always respond with 200 OK for OPTIONS
  return res.status(200).end();
}) as RequestHandler);

// Handle OPTIONS requests for the direct-alt endpoint
router.options('/google/callback/direct-alt', ((req: Request, res: Response) => {
  const origin = req.headers.origin;
  console.log('OPTIONS request for direct-alt with origin:', origin);
  
  // Always set CORS headers for OPTIONS requests
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  return res.status(200).end();
}) as RequestHandler);

// Handle OPTIONS requests for the direct2-test endpoint
router.options('/google/callback/direct2-test', ((req: Request, res: Response) => {
  const origin = req.headers.origin;
  console.log('OPTIONS request for direct2-test with origin:', origin);
  
  // Always set CORS headers for OPTIONS requests
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  return res.status(200).end();
}) as RequestHandler);

// Catch-all route to help with debugging
router.all('*', (req: Request, res: Response) => {
  console.log('Hit fallback route:', req.originalUrl);
  res.status(404).json({ 
    error: "Route not found, but hit the auth router", 
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

export default router; 