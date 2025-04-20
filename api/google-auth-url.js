// Google Auth URL Generator Endpoint
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  try {
    // Get client ID from environment
    const clientId = process.env.GOOGLE_CLIENT_ID;
    
    if (!clientId) {
      throw new Error('Missing Google client ID in environment variables');
    }
    
    // Get redirect URI from query params or use default
    const { redirect_uri = 'https://www.quits.cc/auth/callback', state = Date.now().toString() } = req.query;
    
    // Define the OAuth scopes needed
    const scopes = [
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'openid'
    ];
    
    // Construct the authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    
    // Add required parameters
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirect_uri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scopes.join(' '));
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'select_account consent'); // Always show account picker and consent
    authUrl.searchParams.append('state', state); // CSRF protection
    
    // Log the generated URL (without sensitive info)
    console.log(`Generated Google auth URL for redirect_uri: ${redirect_uri}`);
    
    // Return the authorization URL
    return res.status(200).json({
      url: authUrl.toString()
    });
    
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    
    return res.status(500).json({
      error: 'configuration_error',
      message: error.message,
      has_client_id: !!process.env.GOOGLE_CLIENT_ID
    });
  }
} 