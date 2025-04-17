// Google OAuth Proxy - Standalone handler that doesn't rely on the backend codebase
import { google } from 'googleapis';
import jsonwebtoken from 'jsonwebtoken';
import { setCorsHeaders } from './cors-middleware.js';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Generate a JWT token with jsonwebtoken
const generateToken = (payload) => {
  const jwt = jsonwebtoken;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

// Handler for Google OAuth proxy
export default async function handler(req, res) {
  // Handle CORS
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return;

  // Log detailed request info
  console.log('=== Google Proxy Handler ===');
  console.log('Path:', req.url);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  console.log('Query:', req.query);
  
  try {
    // Must have a code query parameter
    const code = req.query.code;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://api.quits.cc/api/auth/google/callback'
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2('v2');
    const userInfoResponse = await oauth2.userinfo.get({
      auth: oauth2Client,
    });
    const userInfo = userInfoResponse.data;

    // Create user data object
    const user = {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || '',
      picture: userInfo.picture || ''
    };

    // Generate JWT token
    const token = generateToken({ 
      id: user.id, 
      email: user.email,
      createdAt: new Date().toISOString()
    });

    // Return JSON response
    return res.status(200).json({
      success: true,
      token,
      user
    });
  } catch (error) {
    console.error('Google Proxy Error:', error);
    
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: error.response?.data || {}
    });
  }
} 