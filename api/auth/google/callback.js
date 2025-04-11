// Google OAuth Callback - Standalone handler
import { setCorsHeaders } from '../../cors-middleware.js';

export default async function handler(req, res) {
  console.log('Vercel Serverless Function - Google OAuth Callback hit');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', req.query);
  
  // Handle CORS with shared middleware
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return corsResult; // Return early if it was an OPTIONS request
  
  // Get code from query parameters
  const { code, redirect } = req.query;
  
  if (!code) {
    console.log('Error: Missing authorization code');
    return res.status(400).json({ error: 'Missing authorization code' });
  }
  
  try {
    // Google OAuth configuration
    const { google } = await import('googleapis');
    
    // IMPORTANT: Use exactly the same redirectUri in multiple places:
    // 1. What's registered in Google Console
    // 2. In the auth index.js file
    // 3. Here in the callback
    
    // Support multiple redirect URI formats depending on what's registered in Google Console
    // The most likely ones are:
    // - https://quits.cc/auth/callback (no www, shorter)
    // - https://www.quits.cc/auth/callback (with www)
    // - https://quits.cc/api/auth/google/callback (API path)
    
    // CRITICAL: This must match EXACTLY what's registered in Google Console
    const redirectUri = 'https://quits.cc/auth/callback';
    console.log('Using redirect URI:', redirectUri);
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    // Exchange code for tokens
    console.log('Exchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received successfully');
    
    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2('v2');
    console.log('Fetching user info...');
    const userInfoResponse = await oauth2.userinfo.get({
      auth: oauth2Client,
    });
    const userInfo = userInfoResponse.data;
    console.log('User info received:', userInfo.email);
    
    if (!userInfo.id || !userInfo.email) {
      throw new Error('Failed to retrieve user information');
    }
    
    // Generate a JWT token
    const jwt = await import('jsonwebtoken');
    const token = jwt.sign(
      { 
        id: userInfo.id,
        email: userInfo.email
      },
      process.env.JWT_SECRET || 'your-jwt-secret-key',
      { expiresIn: '7d' }
    );
    
    // Return JSON or redirect based on the request
    if (req.headers.accept?.includes('application/json')) {
      console.log('Returning JSON response');
      return res.json({
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
    
    // Redirect to the dashboard with the token
    // Always use www version for the redirect to maintain consistency
    const redirectUrl = redirect || 'https://www.quits.cc/dashboard';
    console.log('Redirecting to:', redirectUrl);
    return res.redirect(`${redirectUrl}?token=${token}`);
    
  } catch (error) {
    console.error('Error in Google callback handler:', error);
    
    // Return error in appropriate format
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
} 