import { setCorsHeaders } from '../../cors-middleware.js';
import { google } from 'googleapis';

export default function handler(req, res) {
  console.log('Google Auth Initialization handler called');
  console.log('Full URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', req.headers.origin);
  
  // Handle CORS with shared middleware
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return corsResult; // Return early if it was an OPTIONS request
  
  try {
    // CRITICAL: This redirect URI must match EXACTLY what's registered in Google Console
    // and what's used in the callback handler
    const redirectUri = 'https://www.quits.cc/auth/callback';
    console.log('Using redirect URI:', redirectUri);
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    
    // Generate auth URL
    // Ask for the Gmail profile / read-only scope too – this is required by the
    // email-scan endpoint which calls users.getProfile and reads message data.
    // NOTE: keep the list minimal (no full mail access) to improve the consent
    // screen language and avoid scaring users.
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid'
    ];
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      include_granted_scopes: true,
      // Pass along the original origin in state to ensure proper redirect
      state: req.headers.origin || 'https://www.quits.cc'
    });
    
    console.log('Generated auth URL:', url);
    
    // Send URL to client
    res.status(200).json({ url });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ 
      error: 'Failed to generate auth URL',
      message: error.message,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
} 