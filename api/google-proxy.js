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
  console.log('Query params:', req.query);
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    // Must have a code query parameter
    const code = req.query.code;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    // Store code prefix for logging (don't log the full code for security)
    const codePrefix = code.substring(0, 10) + '...';
    console.log(`Processing authorization code: ${codePrefix}`);
    
    // Try multiple redirect URIs to find the one that works
    const redirectUris = [
      'https://www.quits.cc/auth/callback',
      'https://quits.cc/auth/callback',
      'https://api.quits.cc/api/auth/google/callback',
      'https://api.quits.cc/api/google-proxy'
    ];
    
    let lastError = null;
    let invalidGrantEncountered = false;
    
    // Try each redirect URI
    for (const redirectUri of redirectUris) {
      try {
        console.log(`Trying with redirect URI: ${redirectUri}`);
        
        // Check if we already got an invalid_grant error
        if (invalidGrantEncountered) {
          console.log('Skipping further attempts due to previous invalid_grant error');
          break;
        }
        
        // Create OAuth client with current redirect URI
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          redirectUri
        );

        // Log environment info for debugging
        console.log('Environment:', {
          NODE_ENV: process.env.NODE_ENV,
          hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
          hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
          hasJwtSecret: !!process.env.JWT_SECRET
        });
        
        // Exchange code for tokens
        console.log(`Exchanging code ${codePrefix} for tokens...`);
        const { tokens } = await oauth2Client.getToken(code);
        console.log('Token exchange successful');
        
        oauth2Client.setCredentials(tokens);

        // Get user info
        console.log('Fetching user info...');
        const oauth2 = google.oauth2('v2');
        const userInfoResponse = await oauth2.userinfo.get({
          auth: oauth2Client,
        });
        const userInfo = userInfoResponse.data;
        console.log(`User info received for: ${userInfo.email}`);

        // Create user data object
        const user = {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name || '',
          picture: userInfo.picture || ''
        };

        // Generate JWT token
        console.log('Generating JWT token...');
        const token = generateToken({ 
          id: user.id, 
          email: user.email,
          createdAt: new Date().toISOString()
        });
        console.log('JWT token generated successfully');

        // Return JSON response
        return res.status(200).json({
          success: true,
          token,
          user,
          redirect_uri_used: redirectUri
        });
      } catch (err) {
        console.log(`Failed with redirect URI ${redirectUri}: ${err.message}`);
        console.log('Error details:', err);
        
        lastError = err;
        
        // If it's an invalid_grant error, no point trying other URIs
        if (err.message.includes('invalid_grant')) {
          invalidGrantEncountered = true;
          console.log('Invalid grant error encountered - code may be expired or already used');
        }
        
        // Only continue to next URI if it's a redirect_uri_mismatch error
        if (!err.message.includes('redirect_uri_mismatch')) {
          break;
        }
      }
    }
    
    // If we get here, all URIs failed
    if (invalidGrantEncountered) {
      return res.status(400).json({
        error: 'Authentication failed',
        message: 'The authorization code has expired or has already been used',
        details: {
          error: 'invalid_grant',
          error_description: 'OAuth codes are single-use and expire quickly'
        }
      });
    }
    
    throw lastError || new Error('Failed to authenticate with all redirect URIs');
  } catch (error) {
    console.error('Google Proxy Error:', error);
    
    // Provide a user-friendly error message based on the type of error
    let errorMessage = error.message;
    let errorDetails = error.response?.data || {};
    
    if (error.message.includes('invalid_grant')) {
      errorMessage = 'The authorization code has expired or has already been used';
      errorDetails = {
        error: 'invalid_grant',
        error_description: 'Please try logging in again'
      };
    } else if (error.message.includes('redirect_uri_mismatch')) {
      errorMessage = 'OAuth configuration error: redirect URI mismatch';
      errorDetails = {
        error: 'redirect_uri_mismatch',
        error_description: 'The redirect URI in the request does not match any of the authorized redirect URIs'
      };
    }
    
    return res.status(500).json({
      error: 'Authentication failed',
      message: errorMessage,
      details: errorDetails
    });
  }
} 