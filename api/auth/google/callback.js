// Google OAuth Callback - Standalone handler
import { setCorsHeaders } from '../../cors-middleware.js';

export default async function handler(req, res) {
  console.log('Vercel Serverless Function - Google OAuth Callback hit');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', req.query);
  
  // Always ensure proper CORS headers are set, especially for Cache-Control
  const origin = req.headers.origin || '';
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Explicitly include Cache-Control in allowed headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token');
  
  // For preflight requests, return immediately after setting headers
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request with explicit Cache-Control header support');
    return res.status(204).end();
  }
  
  // Get code from query parameters
  const { code, redirect } = req.query;
  
  if (!code) {
    console.log('Error: Missing authorization code');
    return res.status(400).json({ error: 'Missing authorization code' });
  }
  
  try {
    // Google OAuth configuration
    const { google } = await import('googleapis');
    
    // Support multiple redirect URI formats depending on what's registered in Google Console
    // The most likely ones are:
    // - https://quits.cc/auth/callback (no www, shorter)
    // - https://www.quits.cc/auth/callback (with www)
    // - https://api.quits.cc/api/auth/google/callback (API path)
    
    // Try multiple redirect URIs to increase the chance of success
    // The one we use here MUST match one of the URIs registered in Google Console
    const possibleRedirectUris = [
      'https://www.quits.cc/auth/callback', // Primary (with www)
      'https://quits.cc/auth/callback',     // Secondary (without www)
      'https://api.quits.cc/api/auth/google/callback' // API path (fallback)
    ];
    
    // Start with the primary redirect URI
    let redirectUri = possibleRedirectUris[0];
    console.log('Using primary redirect URI:', redirectUri);
    
    // Create OAuth client with our primary URI
    let oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    // Exchange code for tokens
    console.log('Exchanging code for tokens...');
    let tokens;
    let exchangeSuccessful = false;
    let lastError;
    
    // Try each redirect URI until one works
    for (const uri of possibleRedirectUris) {
      try {
        // Update the redirect URI for this attempt
        redirectUri = uri;
        console.log(`Attempting token exchange with redirect URI: ${redirectUri}`);
        
        // Create a new OAuth client with this URI
        oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          redirectUri
        );
        
        // Try to exchange the code for tokens
        const response = await oauth2Client.getToken(code);
        tokens = response.tokens;
        console.log('Tokens received successfully with URI:', redirectUri);
        exchangeSuccessful = true;
        break; // Exit the loop if successful
      } catch (error) {
        lastError = error;
        console.error(`Token exchange failed with URI ${redirectUri}:`, error.message);
        // Continue to the next URI
      }
    }
    
    // If none of the URIs worked, throw the last error
    if (!exchangeSuccessful) {
      console.error('All redirect URIs failed. Last error:', lastError?.message);
      throw lastError || new Error('Failed to exchange authorization code for tokens');
    }
    
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