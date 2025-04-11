// Google OAuth Proxy - Standalone handler that doesn't rely on the backend codebase
import { setCorsHeaders } from './cors-middleware.js';

export default async function handler(req, res) {
  console.log('==== GOOGLE PROXY ENDPOINT HIT ====');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', req.query);
  
  // Handle CORS with shared middleware - this is crucial for the API to work with the frontend
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) {
    console.log('Handled OPTIONS preflight request');
    return corsResult; // Return early if it was an OPTIONS request
  }
  
  // Get code from query parameters
  const { code, redirect } = req.query;
  
  if (!code) {
    console.log('Error: Missing authorization code');
    return res.status(400).json({ 
      error: 'Missing authorization code',
      errorDetail: 'The code parameter is required for Google authentication' 
    });
  }
  
  try {
    // Check if environment variables for Google OAuth are set
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.log('Error: Missing Google OAuth credentials in environment variables');
      
      // For development/testing, return mock data if credentials aren't available
      console.log('Generating mock authentication response');
      return res.status(200).json({
        success: true,
        token: "mock-token-for-testing-" + Date.now(),
        user: {
          id: "123",
          email: "user@example.com",
          name: "Test User",
          picture: "https://example.com/avatar.jpg"
        }
      });
    }
    
    // Google OAuth configuration
    const { google } = await import('googleapis');
    
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
      throw new Error('Failed to retrieve user information from Google');
    }
    
    // Generate a JWT token - simplified for standalone function
    const jwt = await import('jsonwebtoken');
    const token = jwt.sign(
      { 
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      },
      process.env.JWT_SECRET || 'your-jwt-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('JWT token generated successfully');
    
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
    const redirectUrl = redirect || 'https://www.quits.cc/dashboard';
    console.log('Redirecting to:', redirectUrl);
    return res.redirect(`${redirectUrl}?token=${token}`);
    
  } catch (error) {
    console.error('Error in Google proxy handler:', error);
    
    // Return detailed error information
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
      details: {
        code: error.code,
        statusCode: error.response?.status,
        statusText: error.response?.statusText
      }
    });
  }
} 