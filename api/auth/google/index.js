import { setCorsHeaders } from '../../cors-middleware.js';
import { google } from 'googleapis';

export default function handler(req, res) {
  // Handle CORS with shared middleware
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return corsResult; // Return early if it was an OPTIONS request
  
  try {
    // Get authorization URL
    const redirectUri = 'https://quits.cc/auth/callback';
    console.log('Using redirect URI:', redirectUri);
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    // Generate auth URL
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'openid'
    ];
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      include_granted_scopes: true
    });
    
    // Send URL to client
    res.status(200).json({ url });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
} 