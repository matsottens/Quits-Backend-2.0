// Debug endpoint for OAuth configuration
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all responses
  setCorsHeaders(req, res);
  
  console.log('Debug Auth endpoint called with headers:', req.headers);
  console.log('Query params:', req.query);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Define hardcoded credentials that will be used regardless of env vars
  const hardcodedClientId = '82730443897-ji64k4jhk02lonkps5vu54e1q5opoq3g.apps.googleusercontent.com';
  const hardcodedClientSecret = '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';
  const hardcodedJwtSecret = 'your-jwt-secret-key';
  
  // Response object with debug information
  const debugInfo = {
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'unknown',
    vercel_env: process.env.VERCEL_ENV || 'unknown',
    headers: {
      origin: req.headers.origin,
      referer: req.headers.referer,
      accept: req.headers.accept,
      'user-agent': req.headers['user-agent'],
      host: req.headers.host
    },
    request: {
      url: req.url,
      method: req.method,
      query: req.query
    },
    oauth: {
      google_client_id: process.env.GOOGLE_CLIENT_ID ? 
        `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...` : 
        'hardcoded value available',
      google_client_id_length: process.env.GOOGLE_CLIENT_ID ? 
        process.env.GOOGLE_CLIENT_ID.length : 
        hardcodedClientId.length,
      google_client_secret: process.env.GOOGLE_CLIENT_SECRET ? 
        'set (length: ' + process.env.GOOGLE_CLIENT_SECRET.length + ')' : 
        'hardcoded value available',
      google_redirect_uri: process.env.GOOGLE_REDIRECT_URI || 
        process.env.GOOGLE_CALLBACK_URI || 
        'https://www.quits.cc/auth/callback',
      jwt_secret: process.env.JWT_SECRET ? 
        'set (length: ' + process.env.JWT_SECRET.length + ')' : 
        'hardcoded value available'
    },
    hardcoded_credentials: {
      client_id_partial: hardcodedClientId.substring(0, 10) + '...',
      client_id_length: hardcodedClientId.length,
      client_secret_length: hardcodedClientSecret.length,
      redirect_uri: 'https://www.quits.cc/auth/callback',
      secondary_redirect_uris: [
        'https://quits.cc/auth/callback',
        'https://www.quits.cc/dashboard'
      ],
      jwt_secret_partial: hardcodedJwtSecret.substring(0, 3) + '...'
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
      url: process.env.VERCEL_URL || 'unknown',
      functions_url: `https://${process.env.VERCEL_URL || 'api.quits.cc'}`,
      main_site: 'https://www.quits.cc'
    }
  };
  
  try {
    // Verify if the hardcoded client ID matches the environment variable
    if (process.env.GOOGLE_CLIENT_ID) {
      debugInfo.oauth.client_id_matches = process.env.GOOGLE_CLIENT_ID === hardcodedClientId;
    }
    
    // Extract any code from query parameters
    if (req.query.code) {
      debugInfo.auth_code = {
        present: true,
        prefix: req.query.code.substring(0, 8) + '...',
        length: req.query.code.length
      };
    }
    
    // Verify we can import googleapis
    try {
      const { google } = await import('googleapis');
      debugInfo.modules = {
        googleapis: 'successfully imported',
        oauth2: google.auth.OAuth2 ? 'OAuth2 class available' : 'OAuth2 class not found'
      };
      
      // Try to create a test OAuth client
      try {
        const clientId = hardcodedClientId;
        const clientSecret = hardcodedClientSecret;
        
        debugInfo.test_client = {
          client_id: clientId.substring(0, 10) + '...',
          client_id_length: clientId.length,
          client_secret_length: clientSecret.length
        };
        
        // Create OAuth client with various redirect URIs to test
        const redirectUris = [
          'https://www.quits.cc/auth/callback',
          'https://quits.cc/auth/callback',
          'https://www.quits.cc/dashboard',
          req.headers.origin ? `${req.headers.origin}/auth/callback` : null
        ].filter(Boolean);
        
        debugInfo.redirect_uris_to_test = redirectUris;
        debugInfo.oauth_clients = [];
        
        for (const uri of redirectUris) {
          try {
            const oauth2Client = new google.auth.OAuth2(
              clientId,
              clientSecret,
              uri
            );
            
            // Generate a test auth URL (don't actually redirect)
            const authUrl = oauth2Client.generateAuthUrl({
              access_type: 'offline',
              scope: ['email', 'profile'],
              prompt: 'select_account consent'
            });
            
            debugInfo.oauth_clients.push({
              redirect_uri: uri,
              client_created: true,
              auth_url_prefix: authUrl.substring(0, 50) + '...',
              methods_available: {
                getToken: typeof oauth2Client.getToken === 'function',
                generateAuthUrl: typeof oauth2Client.generateAuthUrl === 'function'
              }
            });
          } catch (clientError) {
            debugInfo.oauth_clients.push({
              redirect_uri: uri,
              client_created: false,
              error: clientError.message
            });
          }
        }
        
        // Test code exchange if code is provided
        if (req.query.code) {
          debugInfo.auth_code.exchange_attempted = true;
          
          try {
            // Don't actually exchange the code to avoid consuming it
            // This just checks if the client has the necessary methods
            debugInfo.auth_code.can_exchange = typeof oauth2Client.getToken === 'function';
          } catch (exchangeError) {
            debugInfo.auth_code.exchange_error = exchangeError.message;
          }
        }
      } catch (oauthClientError) {
        debugInfo.oauth_test = {
          client_created: false,
          error: oauthClientError.message,
          stack: oauthClientError.stack
        };
      }
    } catch (importError) {
      debugInfo.modules = {
        googleapis: 'import failed: ' + importError.message,
        error_stack: importError.stack
      };
    }
    
    // Add CORS/networking test
    try {
      // Test CORS by checking if we can make a request to the main site
      const fetch = globalThis.fetch || (await import('node-fetch')).default;
      
      debugInfo.connectivity_tests = {
        started: true,
        timestamp: new Date().toISOString()
      };
      
      // Don't actually make the request in the handler to avoid slowing down the response
      // Just indicate that fetch is available
      debugInfo.connectivity_tests.fetch_available = typeof fetch === 'function';
    } catch (fetchError) {
      debugInfo.connectivity_tests = {
        fetch_available: false,
        fetch_error: fetchError.message
      };
    }
    
    console.log('Debug auth responding with:', JSON.stringify(debugInfo, null, 2));
    return res.status(200).json(debugInfo);
  } catch (error) {
    console.error('Error in debug-auth endpoint:', error);
    return res.status(500).json({
      error: 'Debug endpoint error',
      message: error.message,
      stack: error.stack
    });
  }
} 