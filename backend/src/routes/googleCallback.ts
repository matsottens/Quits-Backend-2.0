import { Request, Response } from 'express';
import { google } from 'googleapis';
import { supabase } from '../config/supabase';
import { generateToken } from '../utils/jwt';
import { upsertUser } from '../services/database';

// Handle OPTIONS requests for the Google callback endpoint
export const handleGoogleCallbackOptions = (req: Request, res: Response) => {
  console.log('[OPTIONS] Google Callback Options Handler');
  
  const origin = req.headers.origin || '';
  
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    // Set proper CORS headers for preflight request
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
  
  // Send 204 No Content for OPTIONS requests
  return res.status(204).end();
};

// Handle Google OAuth callback
export const handleGoogleCallback = async (req: Request, res: Response) => {
  console.log('===========================================================');
  console.log('GOOGLE CALLBACK HANDLER CALLED');
  console.log('===========================================================');
  console.log('Request URL:', req.url);
  console.log('Request path:', req.path);
  console.log('Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', JSON.stringify(req.query, null, 2));
  console.log('GOOGLE_REDIRECT_URI from env:', process.env.GOOGLE_REDIRECT_URI);
  
  try {
    // Extract request parameters
    const code = req.query.code as string | undefined;
    const oauthError = req.query.error as string | undefined;
    const callback = req.query.callback as string | undefined;
    const redirect = req.query.redirect as string | undefined;

    console.log('Auth callback request received:', {
      path: req.path,
      originalUrl: req.originalUrl,
      origin: req.headers.origin,
      referer: req.headers.referer,
      hasCode: !!code,
      codePrefix: code ? code.substring(0, 10) + '...' : 'none',
      hasRedirect: !!redirect
    });

    // Set CORS headers for all responses
    const corsOrigin = req.headers.origin || '';
    if (corsOrigin && (corsOrigin.includes('quits.cc') || corsOrigin.includes('localhost'))) {
      res.header('Access-Control-Allow-Origin', corsOrigin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
      res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      console.log('CORS headers set for origin:', corsOrigin);
    } else {
      console.log('No CORS headers set - unknown origin:', corsOrigin);
    }

    // Check if JSONP callback is provided
    const isJsonp = typeof callback === 'string' && callback.length > 0;

    // Handle OAuth error if present
    if (oauthError) {
        console.error('Google OAuth Error on callback:', oauthError);
        
        if (isJsonp) {
          return res.send(`${callback}({"error": "google_oauth_failed", "details": "${oauthError}"})`);
        }
        
        // Determine frontend URL for redirection
        const frontendUrl = getFrontendUrl(redirect, req.headers.origin, req.headers.referer);
        const loginUrl = `${frontendUrl}/login`;
        
        console.log('Redirecting with error to:', `${loginUrl}?error=google_oauth_failed&details=${oauthError}`);
        return res.redirect(`${loginUrl}?error=google_oauth_failed&details=${oauthError}`);
    }

    // Validate authorization code
    if (!code) {
      console.error('Authorization code is required.');
      
      if (isJsonp) {
        return res.send(`${callback}({"error": "missing_code"})`);
      }
      
      const frontendUrl = getFrontendUrl(redirect, req.headers.origin, req.headers.referer);
      const loginUrl = `${frontendUrl}/login`;
      
      console.log('Redirecting with missing code error to:', `${loginUrl}?error=missing_code`);
      return res.redirect(`${loginUrl}?error=missing_code`);
    }

    // CRITICAL: For token exchange, we MUST use the exact same redirect URI
    // that was used in the initial authorization request
    const redirectUri = 'https://www.quits.cc/auth/callback';
    console.log(`Using fixed redirect URI for token exchange: ${redirectUri}`);

    // Create OAuth client for token exchange
    const tokenExchangeOauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
    );

    console.log('Attempting to exchange code for tokens...');
    
    try {
      // Exchange authorization code for tokens
      const { tokens } = await tokenExchangeOauth2Client.getToken(code);
      console.log('Tokens received successfully:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date
      });
      
      // Set credentials on client for API calls
      tokenExchangeOauth2Client.setCredentials(tokens);
  
      // Get user info from Google
      const oauth2 = google.oauth2('v2');
      const userInfoResponse = await oauth2.userinfo.get({
        auth: tokenExchangeOauth2Client,
      });
      const userInfo = userInfoResponse.data;
  
      console.log('User info retrieved:', {
        email: userInfo.email,
        hasId: !!userInfo.id
      });
      
      if (!userInfo.id || !userInfo.email) {
        throw new Error('Failed to retrieve user information');
      }
  
      // Create or update user in database
      const user = await upsertUser({
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name || undefined,
        picture: userInfo.picture || undefined,
        // verified_email not stored in local dev schema
      });
      
      console.log('User upserted in database:', {
        id: user.id,
        email: user.email
      });
  
      // Store tokens in Supabase
      try {
        const { error: tokenStoreError } = await supabase
          .from('user_tokens')
          .upsert({
            user_id: user.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token, 
            expires_at: tokens.expiry_date || null
          }, { onConflict: 'user_id' });
    
        if (tokenStoreError) {
          console.error('Error storing user tokens:', tokenStoreError);
        }
      } catch (storeError) {
        console.error('Failed to store tokens:', storeError);
        // Continue even if token storage fails
      }
  
      // Generate JWT token
      const appTokenPayload = { id: user.id, email: user.email };
      const appToken = generateToken(appTokenPayload);
      console.log('JWT token generated successfully');
      
      // Handle JSONP response
      if (isJsonp) {
        const responseData = {
          token: appToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.avatar_url
          }
        };
        console.log('Sending JSONP response');
        return res.send(`${callback}(${JSON.stringify(responseData)})`);
      }
      
      // Handle JSON response
      if (req.headers.accept?.includes('application/json')) {
        console.log('Sending JSON response');
        return res.json({
          token: appToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.avatar_url
          }
        });
      }
      
      // Handle redirect to frontend
      const dashboardUrl = getRedirectUrl(redirect);
      console.log('Redirecting to frontend with token:', dashboardUrl);
      return res.redirect(`${dashboardUrl}?token=${appToken}`);
      
    } catch (tokenError: any) {
      console.error('Error exchanging code for tokens:', tokenError.message);
      console.error('Full error:', tokenError);
      
      if (tokenError.message.includes('redirect_uri_mismatch')) {
        console.error('REDIRECT URI MISMATCH ERROR - this is the most common issue');
        console.error('Expected URI in Google Console:', redirectUri);
        console.error('Make sure this exact URI is registered in Google Developer Console');
        
        // Return detailed error about the redirect URI mismatch
        if (req.headers.accept?.includes('application/json')) {
          return res.status(400).json({
            error: 'redirect_uri_mismatch',
            message: 'The redirect URI does not match what is registered with Google',
            expected: redirectUri,
            registered: [
              'https://quits.cc/auth/callback',
              'https://www.quits.cc/auth/callback',
              'https://api.quits.cc/api/auth/google/callback'
            ]
          });
        }
      }
      
      throw tokenError;
    }
  } catch (error: any) {
    console.error('Google OAuth Callback Error:', error.response?.data || error.message);
    console.error('Stack trace:', error.stack);
    
    if (error.response) {
      console.error('Google API error details:', error.response.data);
    }
    
    // Handle JSONP error response if callback was provided
    const callback = req.query.callback as string | undefined;
    if (typeof callback === 'string' && callback.length > 0) {
      return res.send(`${callback}({"error": "auth_failed", "message": ${JSON.stringify(error.message)}})`);
    }
    
    // Get redirect URL for error cases
    const redirect = req.query.redirect as string | undefined;
    const frontendUrl = getFrontendUrl(redirect, req.headers.origin, req.headers.referer);
    const loginUrl = `${frontendUrl}/login`;
    
    // Determine error type and details
    let errorCode = 'google_auth_failed';
    let errorDetails = '';
    
    if (error.response?.data?.error === 'redirect_uri_mismatch') {
      errorCode = 'redirect_uri_mismatch';
      errorDetails = '&details=Redirect+URI+mismatch+in+OAuth+config';
    } else if (error.response?.data?.error === 'invalid_grant') {
      errorCode = 'invalid_grant';
      errorDetails = '&details=Invalid+or+expired+authorization+code';
    }
    
    console.log('Redirecting to login with error:', `${loginUrl}?error=${errorCode}${errorDetails}`);
    return res.redirect(`${loginUrl}?error=${errorCode}${errorDetails}`);
  }
};

// Helper function to get the frontend URL
function getFrontendUrl(
  redirectParam?: string, 
  originHeader?: string, 
  refererHeader?: string
): string {
  // If redirect param provided, extract the origin
  if (redirectParam) {
    try {
      const redirectUrl = new URL(redirectParam);
      return `${redirectUrl.protocol}//${redirectUrl.host}`;
    } catch (error) {
      // Invalid URL format
    }
  }
  // If origin header provided
  if (originHeader) {
    return originHeader;
  }
  // If referer header provided
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      return `${refererUrl.protocol}//${refererUrl.host}`;
    } catch (error) {
      // Invalid URL format
    }
  }
  // Default frontend URL
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5173';
  }
  return 'https://www.quits.cc';
}

// Helper function to get the redirect URL
function getRedirectUrl(redirectParam?: string): string {
  if (redirectParam) {
    // Ensure we're redirecting to the frontend, not the API
    if (redirectParam.includes('api.quits.cc')) {
      return redirectParam.replace('api.quits.cc', 'www.quits.cc');
    }
    return redirectParam;
  }
  // Default dashboard URL
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5173/dashboard';
  }
  return 'https://www.quits.cc/dashboard';
} 