import { Request, Response } from 'express';
import { google } from 'googleapis';
import { supabase } from '../config/supabase';
import { generateToken } from '../utils/jwt.js';
import { upsertUser } from '../services/database';

// Emergency proxy route that can be registered directly in index.ts
export const handleGoogleProxy = async (req: Request, res: Response): Promise<void> => {
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
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }
  
  // Use a single redirect URI to simplify the flow - must match what frontend used
  const redirectUri = 'https://www.quits.cc/auth/callback';
  
  try {
    console.log(`[PROXY] Using redirect URI: ${redirectUri}`);
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    console.log('[PROXY] Created OAuth client, attempting to exchange code for tokens...');
    
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
    
    // Generate token with a fallback JWT secret if needed
    const jwtSecret = process.env.JWT_SECRET || 'quits-jwt-secret-key-development';
    console.log('[PROXY] Using JWT secret:', jwtSecret.substring(0, 3) + '...');
    
    const token = await generateToken({ id: user.id, email: user.email });
    console.log('[PROXY] Generated JWT token');
    
    // Return JSON or redirect based on the request
    if (req.headers.accept?.includes('application/json')) {
      console.log('[PROXY] Returning JSON response');
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
      return;
    }
    
    // Redirect to the dashboard with the token
    const redirectUrl = (req.query.redirect as string) || 'https://www.quits.cc/dashboard';
    console.log(`[PROXY] Redirecting to: ${redirectUrl}?token=${token.substring(0, 10)}...`);
    res.redirect(`${redirectUrl}?token=${token}`);
    return;
  } catch (error: any) {
    console.error('[PROXY] Error in Google proxy handler:', error.message);
    console.error('[PROXY] Stack trace:', error.stack);
    
    if (error.response) {
      console.error('[PROXY] Google API error details:', error.response.data);
    }
    
    // Provide a detailed error response
    res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: {
        error_type: error.name || 'Unknown',
        error_message: error.message || 'No specific error message',
        code_prefix: code.substring(0, 10) + '...',
        origin: req.headers.origin || 'none',
        redirect_uri_used: redirectUri
      }
    });
    return;
  }
}; 