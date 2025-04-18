// Google OAuth Callback - Standalone handler
import { setCorsHeaders } from '../../utils.js';

export default async function handler(req, res) {
  console.log('Vercel Serverless Function - Google OAuth Callback hit');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', req.query);
  
  // Always ensure proper CORS headers are set
  setCorsHeaders(req, res);
  
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
        // Add more detailed logging for invalid_grant errors (these are expected in many cases)
        if (error.response?.data?.error === 'invalid_grant') {
          console.log('Invalid grant error received - this is expected if the code was already used or expired');
        } else {
          console.error(`Token exchange failed with URI ${redirectUri}:`, error.message);
        }
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
    const token = jwt.default.sign(
      { 
        id: userInfo.id,
        email: userInfo.email,
        gmail_token: tokens.access_token, // Include Gmail token in the JWT
        createdAt: new Date().toISOString()
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
    
    // For HTML redirects, use an HTML page with meta refresh and script to localStorage
    // This avoids CSP issues by letting the browser set the token directly
    const redirectUrl = redirect || 'https://www.quits.cc/dashboard';
    console.log('Redirecting to:', redirectUrl);
    
    // Use safe redirect with no CSP issues
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Redirecting to Dashboard</title>
        <meta http-equiv="refresh" content="0; URL='${redirectUrl}'">
        <meta name="robots" content="noindex">
      </head>
      <body>
        <script>
          // Store token in localStorage before redirect
          localStorage.setItem('token', '${token}');
          // Redirect immediately
          window.location.href = '${redirectUrl}';
        </script>
        <noscript>
          <meta http-equiv="refresh" content="0; URL='${redirectUrl}?token=${token}'">
          Please click <a href="${redirectUrl}?token=${token}">here</a> to continue if not redirected.
        </noscript>
        <p>Redirecting to dashboard...</p>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.send(htmlResponse);
    
  } catch (error) {
    console.error('Error in Google callback handler:', error);
    
    // Check for specific error types
    let errorMessage = error.message || 'Authentication failed';
    let errorCode = 'auth_failed';
    let redirectToLogin = true;
    
    // Handle invalid_grant error (expired or already used code)
    if (error.response?.data?.error === 'invalid_grant' || 
        error.message?.includes('invalid_grant')) {
      errorMessage = 'Authorization code has expired or already been used';
      errorCode = 'invalid_grant';
      console.log('Received invalid_grant error - this is normal if the code was already used');
    }
    
    // If client wants JSON, return JSON error
    if (req.headers.accept?.includes('application/json')) {
      console.log('Returning JSON error response');
      return res.status(500).json({
        error: errorCode,
        message: errorMessage,
        details: process.env.NODE_ENV === 'production' ? undefined : error.stack
      });
    }
    
    // Redirect to login with error
    if (redirectToLogin) {
      const loginUrl = redirect?.includes('login') 
        ? redirect 
        : 'https://www.quits.cc/login';
      console.log(`Redirecting to ${loginUrl} with error`);
      return res.redirect(`${loginUrl}?error=${errorCode}&message=${encodeURIComponent(errorMessage)}`);
    }
    
    // Fallback error response
    return res.status(500).json({
      error: errorCode,
      message: errorMessage,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
} 