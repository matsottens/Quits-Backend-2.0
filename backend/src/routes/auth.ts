import express from 'express';
import { google } from 'googleapis';
import { oauth2Client, SCOPES } from '../config/google.js';
import { supabase } from '../config/supabase.js';
import { authenticateUser, AuthRequest } from '../middleware/auth.js';
import { Request, Response } from 'express';
import { generateToken } from '../utils/jwt.js';
import { upsertUser } from '../services/database.js';

const router = express.Router();

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

// Handle Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, error: oauthError, callback } = req.query;

    // Handle JSONP callback if provided (for alternative auth methods)
    const isJsonp = typeof callback === 'string' && callback.length > 0;

    // Log details for debugging
    console.log('Auth callback request received:', {
      origin: req.headers.origin,
      referer: req.headers.referer,
      isJsonp,
      hasCode: !!code
    });

    if (oauthError) {
        console.error('Google OAuth Error on callback:', oauthError);
        
        if (isJsonp) {
          return res.send(`${callback}({"error": "google_oauth_failed", "details": "${oauthError}"})`);
        }
        
        // Redirect back to frontend with error
        const clientRedirectUrl = req.headers.referer?.split('?')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
        return res.redirect(`${clientRedirectUrl.replace('/auth/callback','/login')}?error=google_oauth_failed&details=${oauthError}`);
    }

    if (!code || typeof code !== 'string') {
      console.error('Authorization code is required.');
      
      if (isJsonp) {
        return res.send(`${callback}({"error": "missing_code"})`);
      }
      
      const clientRedirectUrl = req.headers.referer?.split('?')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
      return res.redirect(`${clientRedirectUrl.replace('/auth/callback','/login')}?error=missing_code`);
    }

    // Determine the redirect URI used by the client for this specific request
    // Handle both www and non-www versions
    let origin = req.headers.origin || req.headers.referer?.split('/auth/callback')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
    
    // Normalize the origin to handle both www and non-www versions
    if (origin.includes('quits.cc')) {
      // Allow both formats - the Google OAuth registration should have both formats registered
      origin = origin.replace('https://www.quits.cc', 'https://quits.cc');
    }
    
    const redirectUri = `${origin}/auth/callback`;

    console.log(`Using redirect URI for token exchange: ${redirectUri}`);

    // Create a new OAuth2 client instance FOR TOKEN EXCHANGE
    // It *must* use the same redirect_uri as the initial auth request
    const tokenExchangeOauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );

    console.log('Received auth code, attempting to exchange for tokens...');
    const { tokens } = await tokenExchangeOauth2Client.getToken(code as string);
    console.log('Tokens received:', tokens.access_token ? 'Yes (access token)' : 'No', tokens.refresh_token ? 'Yes (refresh token)' : 'No');
    
    // *** Important: Set credentials on the client for subsequent API calls ***
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

    // Create or update user in Supabase database
    const user = await upsertUser({
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        verified_email: userInfo.verified_email
    });
    console.log('User upserted in DB:', user.email);

    // Store tokens securely (e.g., associated with the user ID in Supabase)
    // Important for accessing Google APIs later (like Gmail)
    const { error: tokenStoreError } = await supabase
      .from('user_tokens') // Ensure this table exists
      .upsert({
          user_id: user.id,
          provider: 'google',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token, // Store refresh token!
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          scopes: tokens.scope
      }, { onConflict: 'user_id, provider' } ); // Upsert based on user_id and provider

    if (tokenStoreError) {
        console.error('Error storing user tokens:', tokenStoreError);
        // Decide how critical this is - maybe proceed but log?
    }

    // Generate JWT token for your application's session
    const appTokenPayload = { id: user.id, email: user.email };
    const appToken = generateToken(appTokenPayload); // Use your JWT generation logic

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
    
    // Otherwise, redirect user back to the frontend (traditional OAuth flow)
    const clientRedirectUrl = redirectUri.replace('/auth/callback', '/dashboard'); // Or determine based on state param
    // Include the app token in the redirect URL (or use cookies/session)
    return res.redirect(`${clientRedirectUrl}?token=${appToken}`);

  } catch (error: any) {
    console.error('Google OAuth Callback Error:', error.response?.data || error.message);
    
    // Handle JSONP error response if callback was provided
    const callback = req.query.callback;
    if (typeof callback === 'string' && callback.length > 0) {
      return res.send(`${callback}({"error": "auth_failed", "message": ${JSON.stringify(error.message)}})`);
    }
    
    // Redirect back to frontend login with a generic error
    // Avoid exposing too much detail to the client
    const clientOrigin = req.headers.origin || process.env.CLIENT_URL || 'http://localhost:5173';
    const loginUrl = `${clientOrigin}/login`;
    let errorCode = 'google_auth_failed';
    if (error.response?.data?.error === 'redirect_uri_mismatch') {
        errorCode = 'redirect_uri_mismatch';
    } else if (error.response?.data?.error === 'invalid_grant') {
        errorCode = 'invalid_grant'; // Often means code expired or already used
    }
    return res.redirect(`${loginUrl}?error=${errorCode}`);
  }
});

// JSONP endpoint for Google OAuth callback (used as a fallback for CORS issues)
router.get('/google/callback/jsonp', async (req: Request, res: Response) => {
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
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
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
});

// Direct form-based callback endpoint with redirect back (CSP-friendly)
router.post('/google/callback/direct2', express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
  try {
    const { code, origin, requestId, redirectUri: providedRedirectUri } = req.body;
    
    console.log('Direct form callback received v2:', {
      hasCode: !!code,
      origin: origin || 'not provided',
      requestId: requestId || 'not provided',
      providedRedirectUri: providedRedirectUri || 'not provided'
    });
    
    // Set CORS headers explicitly - always allow the requesting origin if it's quits.cc
    const requestOrigin = req.headers.origin || '';
    if (requestOrigin.includes('quits.cc')) {
      console.log('Setting CORS headers for origin:', requestOrigin);
      res.header('Access-Control-Allow-Origin', requestOrigin); // Use exactly the requesting origin
      res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    
    // Process the same way as regular callback
    try {
      // Use the provided redirect URI if available, otherwise construct one
      let redirectUri;
      
      if (providedRedirectUri) {
        // Use the redirect URI provided by the client
        redirectUri = providedRedirectUri;
      } else {
        // Handle various origin scenarios as fallback
        if (!origin) {
          // If no origin provided, try to determine from headers
          const headerOrigin = req.headers.origin || '';
          const referer = req.headers.referer || '';
          
          if (headerOrigin.includes('www.quits.cc')) {
            redirectUri = 'https://quits.cc/auth/callback'; // Always use the registered URI
          } else if (headerOrigin.includes('quits.cc')) {
            redirectUri = 'https://quits.cc/auth/callback';
          } else if (referer.includes('www.quits.cc')) {
            redirectUri = 'https://quits.cc/auth/callback';
          } else if (referer.includes('quits.cc')) {
            redirectUri = 'https://quits.cc/auth/callback';
          } else if (headerOrigin.includes('localhost')) {
            redirectUri = `${headerOrigin}/auth/callback`;
          } else {
            // Default fallback
            redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://quits.cc/auth/callback';
          }
        } else {
          // Use the provided origin, but normalize it if needed
          redirectUri = origin.includes('www.quits.cc') 
            ? 'https://quits.cc/auth/callback' 
            : `${origin}/auth/callback`;
        }
      }
      
      console.log('Using redirect URI for direct callback v2:', redirectUri);
      console.log('Request headers:', {
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host
      });
      console.log('Google OAuth environment variables:', {
        CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set',
        CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set',
        REDIRECT_URI_ENV: process.env.GOOGLE_REDIRECT_URI || 'Not set'
      });
      
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
        return res.status(400).json({ error: 'Failed to retrieve user info' });
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
      
      // Set the token as a secure, HTTP-only cookie
      res.cookie('auth_token', appToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      // Additionally return the token and user data in the response
      return res.json({
        success: true,
        token: appToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        },
        requestId: requestId
      });
    } catch (error: any) {
      console.error('Direct auth callback v2 error:', error.message);
      
      let errorMessage = error.message;
      // Make the error message more user-friendly if needed
      if (error.message?.includes('redirect_uri_mismatch')) {
        errorMessage = 'Redirect URI mismatch. Please try again.';
      }
      
      return res.status(400).json({ error: errorMessage });
    }
  } catch (error: any) {
    console.error('Direct form route v2 error:', error);
    return res.status(500).json({ error: 'Server error during authentication' });
  }
});

// Add CORS preflight handler for direct2 endpoint
router.options('/google/callback/direct2', (req: Request, res: Response) => {
  const requestOrigin = req.headers.origin || '';
  
  // Allow both www and non-www domains
  if (requestOrigin.includes('quits.cc')) {
    console.log('Setting preflight CORS headers for origin:', requestOrigin);
    res.header('Access-Control-Allow-Origin', requestOrigin); // Exactly match requesting origin
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(200).send();
  } else {
    console.log('Blocking preflight request from non-allowed origin:', requestOrigin);
    res.status(403).send();
  }
});

// Get user profile (Protected Route)
router.get('/me', authenticateUser, async (req: AuthRequest, res: Response) => {
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
});

// Example Logout (optional - depends on session management)
router.post('/logout', authenticateUser, async (req: AuthRequest, res: Response) => {
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
});

export default router; 