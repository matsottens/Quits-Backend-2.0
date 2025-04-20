// Combined debug endpoints
import { setCorsHeaders, getPath } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all response types
  setCorsHeaders(req, res);

  // Get the path and extract the endpoint type from the query
  const path = getPath(req);
  const { type = 'all' } = req.query;
  
  console.log(`[debug] Request for ${type} from ${req.headers.origin || 'unknown origin'}, path: ${path}`);
  
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // Common environment info
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
      has_google_id: process.env.GOOGLE_CLIENT_ID ? 'yes' : 'no',
      google_id_length: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.length : 0,
      has_google_secret: process.env.GOOGLE_CLIENT_SECRET ? 'yes' : 'no',
      google_secret_length: process.env.GOOGLE_CLIENT_SECRET ? process.env.GOOGLE_CLIENT_SECRET.length : 0,
      has_jwt_secret: process.env.JWT_SECRET ? 'yes' : 'no',
      jwt_secret_length: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
      CLIENT_URL: process.env.CLIENT_URL || 'not set',
      PORT: process.env.PORT || 'not set',
      CORS_ORIGIN: process.env.CORS_ORIGIN || 'not set',
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || 'not set',
      SUPABASE_URL: process.env.SUPABASE_URL ? 'yes' : 'no'
    };
    
    // Determine which type of debug info to return
    if (type === 'env' || type === 'all') {
      // Log all environment variables
      console.log('[debug] Checking environment variables:');
      console.log('NODE_ENV:', process.env.NODE_ENV);
      console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
      console.log('JWT_SECRET:', process.env.JWT_SECRET ? `Set (length: ${process.env.JWT_SECRET.length})` : 'Not set');
      console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `Set (length: ${process.env.GOOGLE_CLIENT_ID.length})` : 'Not set');
      console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? `Set (length: ${process.env.GOOGLE_CLIENT_SECRET.length})` : 'Not set');
      
      // Collect all environment variable names (without values for security)
      const envKeys = Object.keys(process.env).sort();
      console.log('Available environment variables:', envKeys.join(', '));
      
      // Add to the response
      envInfo.env_key_names = envKeys;
      envInfo.all_env_keys_count = envKeys.length;
    }
    
    if (type === 'auth' || type === 'all') {
      // Test Google OAuth client construction
      console.log('[debug] Testing Google OAuth client creation...');
      
      // Get actual values being used
      const clientId = process.env.GOOGLE_CLIENT_ID || '82730443897-ji64k4jhk02lonkps5vu54e1q5opoq3g.apps.googleusercontent.com';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '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';
      const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-key';
      const redirectUri = 'https://www.quits.cc/auth/callback';
      
      try {
        // Try to import Google APIs
        const { google } = await import('googleapis');
        
        // Create OAuth client
        const oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          redirectUri
        );
        console.log('[debug] OAuth client created successfully');
        
        // Add to the response
        envInfo.oauth_client_created = true;
        envInfo.using_hardcoded_fallbacks = !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.JWT_SECRET;
        envInfo.using_client_id = clientId.substring(0, 10) + '...';
        envInfo.using_redirect_uri = redirectUri;
      } catch (error) {
        console.error('[debug] Error creating OAuth client:', error);
        envInfo.oauth_client_created = false;
        envInfo.oauth_client_error = error.message;
      }
    }
    
    // Return the combined response
    return res.status(200).json({
      debug_type: type,
      timestamp: new Date().toISOString(),
      path,
      status: 'OK',
      message: 'Debug information retrieved successfully',
      env: envInfo
    });
    
  } catch (error) {
    console.error('[debug] Error during debug check:', error);
    return res.status(500).json({
      error: 'debug_check_failed',
      debug_type: type,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    });
  }
} 