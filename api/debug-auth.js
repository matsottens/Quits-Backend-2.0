// Debug endpoint for OAuth configuration
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all responses
  setCorsHeaders(req, res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Response object with debug information
  const debugInfo = {
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'unknown',
    vercel_env: process.env.VERCEL_ENV || 'unknown',
    headers: req.headers,
    oauth: {
      google_client_id: process.env.GOOGLE_CLIENT_ID ? 
        `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...` : 
        'not set',
      google_client_id_length: process.env.GOOGLE_CLIENT_ID ? 
        process.env.GOOGLE_CLIENT_ID.length : 
        0,
      google_client_secret: process.env.GOOGLE_CLIENT_SECRET ? 
        'set (length: ' + process.env.GOOGLE_CLIENT_SECRET.length + ')' : 
        'not set',
      google_redirect_uri: process.env.GOOGLE_REDIRECT_URI || 
        process.env.GOOGLE_CALLBACK_URI || 
        'not set',
      jwt_secret: process.env.JWT_SECRET ? 
        'set (length: ' + process.env.JWT_SECRET.length + ')' : 
        'not set'
    },
    server: {
      nodejs_version: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: process.memoryUsage(),
    },
    // Information about where API is deployed
    deployment: {
      region: process.env.VERCEL_REGION || 'unknown',
      url: process.env.VERCEL_URL || 'unknown'
    }
  };
  
  // Verify we can import googleapis
  try {
    const { google } = await import('googleapis');
    debugInfo.modules = {
      googleapis: 'successfully imported',
      oauth2: google.auth.OAuth2 ? 'OAuth2 class available' : 'OAuth2 class not found'
    };
    
    // Try to create a test OAuth client
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID || '123456789-test.apps.googleusercontent.com',
        process.env.GOOGLE_CLIENT_SECRET || 'dummy-secret',
        'https://www.quits.cc/auth/callback'
      );
      
      debugInfo.oauth_test = {
        client_created: true,
        methods_available: {
          getToken: typeof oauth2Client.getToken === 'function',
          generateAuthUrl: typeof oauth2Client.generateAuthUrl === 'function'
        }
      };
    } catch (oauthClientError) {
      debugInfo.oauth_test = {
        client_created: false,
        error: oauthClientError.message
      };
    }
  } catch (importError) {
    debugInfo.modules = {
      googleapis: 'import failed: ' + importError.message
    };
  }
  
  return res.status(200).json(debugInfo);
} 