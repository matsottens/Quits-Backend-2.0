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
    const redirectUri = `${origin}/auth/callback`;

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
      prompt: 'consent' // Force consent screen for refresh token
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
    const { code, error: oauthError } = req.query;

    if (oauthError) {
        console.error('Google OAuth Error on callback:', oauthError);
        // Redirect back to frontend with error
        const clientRedirectUrl = req.headers.referer?.split('?')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
        return res.redirect(`${clientRedirectUrl.replace('/auth/callback','/login')}?error=google_oauth_failed&details=${oauthError}`);
    }

    if (!code || typeof code !== 'string') {
      console.error('Authorization code is required.');
      const clientRedirectUrl = req.headers.referer?.split('?')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
      return res.redirect(`${clientRedirectUrl.replace('/auth/callback','/login')}?error=missing_code`);
    }

    // Determine the redirect URI used by the client for this specific request
    // Use referer as a fallback, then environment variable, then default localhost
    const origin = req.headers.origin || req.headers.referer?.split('/auth/callback')[0] || process.env.CLIENT_URL || 'http://localhost:5173';
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
    console.log('Tokens received:', tokens); // Log tokens (careful in production)
    
    // *** Important: Set credentials on the client for subsequent API calls ***
    tokenExchangeOauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2('v2');
    const userInfoResponse = await oauth2.userinfo.get({
      auth: tokenExchangeOauth2Client,
    });
    const userInfo = userInfoResponse.data;

    console.log('User Info from Google:', userInfo);
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
    console.log('User upserted in DB:', user);

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
    
    // Redirect user back to the frontend dashboard or intended page
    const clientRedirectUrl = redirectUri.replace('/auth/callback', '/dashboard'); // Or determine based on state param
    // Include the app token in the redirect URL (or use cookies/session)
    return res.redirect(`${clientRedirectUrl}?token=${appToken}`);

  } catch (error: any) {
    console.error('Google OAuth Callback Error:', error.response?.data || error.message);
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