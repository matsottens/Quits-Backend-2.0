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

// Direct form-based callback endpoint for maximum compatibility
router.post('/google/callback/direct', express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
  try {
    const { code, origin, messageId } = req.body;
    
    console.log('Direct form callback received:', {
      hasCode: !!code,
      origin: origin || 'not provided',
      messageId: messageId || 'not provided'
    });
    
    if (!code) {
      return res.send(`
        <script>
          parent.handleError("Missing authorization code");
        </script>
      `);
    }
    
    // Process the same way as regular callback
    try {
      // Create redirect URI that matches the origin
      const redirectUri = origin?.includes('www.')
        ? `${origin}/auth/callback`
        : origin?.includes('localhost')
          ? `${origin}/auth/callback` 
          : 'https://quits.cc/auth/callback';
      
      console.log('Using redirect URI for direct callback:', redirectUri);
      
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
        return res.send(`
          <script>
            parent.handleError("Failed to retrieve user info");
          </script>
        `);
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
      
      // Prepare auth response data
      const authResponse = {
        token: appToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      };
      
      // Send response via JavaScript that posts a message to the parent window
      return res.send(`
        <script>
          parent.handleAuth(${JSON.stringify(authResponse)});
        </script>
      `);
    } catch (error: any) {
      console.error('Direct auth callback error:', error.message);
      
      let errorMessage = error.message;
      // Make the error message more user-friendly if needed
      if (error.message?.includes('redirect_uri_mismatch')) {
        errorMessage = 'Redirect URI mismatch. Please try again.';
      }
      
      return res.send(`
        <script>
          parent.handleError(${JSON.stringify(errorMessage)});
        </script>
      `);
    }
  } catch (error: any) {
    console.error('Direct form route error:', error);
    return res.send(`
      <script>
        parent.handleError("Server error during authentication");
      </script>
    `);
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