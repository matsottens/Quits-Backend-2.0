import { Request, Response } from 'express';
import { google } from 'googleapis';
import { supabase } from '../config/supabase.js';
import { generateToken } from '../utils/jwt.js';
import { upsertUser } from '../services/database.js';

// Handle Google OAuth callback
export const handleGoogleCallback = async (req: Request, res: Response) => {
  console.log('Direct Google callback handler called');
  
  try {
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
    const origin = req.headers.origin || '';
    if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
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