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
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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
  
  try {
    // Use hard-coded redirect URI that's guaranteed to match Google Console
    // This is the most important part - use exactly what's registered
    const redirectUri = 'https://quits.cc/auth/callback';
    
    console.log('[PROXY] Using hard-coded redirect URI:', redirectUri);
    
    // Create OAuth client with the exact redirect URI
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('[PROXY] Tokens received successfully');
    
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2('v2');
    const userInfoResponse = await oauth2.userinfo.get({
      auth: oauth2Client,
    });
    const userInfo = userInfoResponse.data;
    
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
    
    // Generate token
    const token = generateToken({ id: user.id, email: user.email });
    
    // Return JSON or redirect based on the request
    if (req.headers.accept?.includes('application/json')) {
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
    return res.redirect(`${redirectUrl}?token=${token}`);
    
  } catch (error: any) {
    console.error('[PROXY] Error in proxy handler:', error);
    
    // Return error in appropriate format
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
}; 