import { Request, Response } from 'express';
import { google } from 'googleapis';
import { supabase } from '../config/supabase.js';
import { generateToken } from '../utils/jwt.js';
import { upsertUser } from '../services/database.js';

// Emergency proxy route that can be registered directly in index.ts
export const handleGoogleProxy = async (req: Request, res: Response) => {
  console.log('=================================================================');
  console.log('[PROXY] Google proxy endpoint hit:', req.path);
  console.log('[PROXY] Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
  console.log('[PROXY] Query params:', JSON.stringify(req.query));
  console.log('[PROXY] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[PROXY] Request origin:', req.headers.origin);
  console.log('=================================================================');
  
  // Set proper CORS headers to match the exact requesting origin
  const origin = req.headers.origin || '';
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    console.log('[PROXY] Set CORS headers for origin:', origin);
  }
  
  // Log environment variables (redact secrets)
  console.log('[PROXY] Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasJwtSecret: !!process.env.JWT_SECRET
  });
  
  const code = req.query.code;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing authorization code' });
  }
  
  // Define all possible redirect URIs to try
  const possibleRedirectUris = [
    'https://www.quits.cc/auth/callback',
    'https://quits.cc/auth/callback',
    'https://api.quits.cc/api/auth/google/callback'
  ];
  
  // Create a variable to track if any attempt was successful
  let lastError = null;
  
  // Try each redirect URI until one works
  for (const redirectUri of possibleRedirectUris) {
    try {
      console.log(`[PROXY] Attempting with redirect URI: ${redirectUri}`);
      
      // Create OAuth client with the current redirect URI
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );
      
      console.log('[PROXY] Created OAuth client, attempting to exchange code for tokens...');
      
      try {
        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        console.log('[PROXY] Tokens received successfully:', {
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiryDate: tokens.expiry_date
        });
        
        oauth2Client.setCredentials(tokens);
        
        // Get user info
        const oauth2 = google.oauth2('v2');
        const userInfoResponse = await oauth2.userinfo.get({
          auth: oauth2Client,
        });
        const userInfo = userInfoResponse.data;
        
        console.log('[PROXY] User info retrieved:', {
          email: userInfo.email,
          hasId: !!userInfo.id
        });
        
        if (!userInfo.id || !userInfo.email) {
          throw new Error('Failed to retrieve user information');
        }
        
        // Create/update user
        const user = await upsertUser({
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name || undefined,
          picture: userInfo.picture || undefined,
          verified_email: userInfo.verified_email || undefined
        });
        
        console.log('[PROXY] User upserted in database:', {
          id: user.id,
          email: user.email
        });
        
        // Generate token
        const token = generateToken({ id: user.id, email: user.email });
        console.log('[PROXY] Generated JWT token');
        
        // Return JSON or redirect based on the request
        if (req.headers.accept?.includes('application/json')) {
          console.log('[PROXY] Returning JSON response');
          return res.json({
            success: true,
            token,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              picture: user.picture
            }
          });
        }
        
        // Redirect to the dashboard with the token
        const redirectUrl = (req.query.redirect as string) || 'https://www.quits.cc/dashboard';
        console.log(`[PROXY] Redirecting to: ${redirectUrl}?token=${token.substring(0, 10)}...`);
        return res.redirect(`${redirectUrl}?token=${token}`);
      } catch (tokenError) {
        console.error(`[PROXY] Token exchange failed for URI ${redirectUri}:`, tokenError.message);
        lastError = tokenError;
        
        // If this is a redirect_uri_mismatch error, try the next URI
        if (tokenError.message.includes('redirect_uri_mismatch')) {
          console.log(`[PROXY] Redirect URI mismatch, trying next URI`);
          continue;
        } else {
          // For other errors, stop trying and return the error
          throw tokenError;
        }
      }
    } catch (error) {
      lastError = error;
      console.error(`[PROXY] Error with redirect URI ${redirectUri}:`, error.message);
      
      // Only continue to the next URI if it's a redirect_uri_mismatch error
      if (!error.message.includes('redirect_uri_mismatch')) {
        break;
      }
    }
  }
  
  // If we get here, all attempts failed
  console.error('[PROXY] All redirect URI attempts failed:', lastError);
  
  // Provide a detailed error response
  return res.status(500).json({
    error: 'Authentication failed',
    message: lastError ? lastError.message : 'Unknown error during authentication',
    details: {
      attempted_uris: possibleRedirectUris,
      error_type: lastError ? lastError.name : 'Unknown',
      error_message: lastError ? lastError.message : 'No specific error message',
      code_prefix: code.substring(0, 10) + '...',
      origin: req.headers.origin || 'none'
    }
  });
}; 