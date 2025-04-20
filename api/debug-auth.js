// Debug endpoint for OAuth configuration
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all response types
  setCorsHeaders(req, res);

  // Log request info
  console.log(`[debug-auth] Request from ${req.headers.origin || 'unknown origin'}`);
  
  try {
    // Log all environment variables
    console.log('[debug-auth] Checking environment variables:');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? `Set (length: ${process.env.JWT_SECRET.length})` : 'Not set');
    console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `Set (length: ${process.env.GOOGLE_CLIENT_ID.length})` : 'Not set');
    console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? `Set (length: ${process.env.GOOGLE_CLIENT_SECRET.length})` : 'Not set');
    console.log('CLIENT_URL:', process.env.CLIENT_URL);
    console.log('PORT:', process.env.PORT);
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
    console.log('JWT_EXPIRES_IN:', process.env.JWT_EXPIRES_IN);
    console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
    
    // Collect all environment variable names (without values for security)
    const envKeys = Object.keys(process.env).sort();
    console.log('Available environment variables:', envKeys.join(', '));
    
    // Test Google OAuth client construction
    console.log('Testing Google OAuth client creation...');
    
    // Get actual values being used
    const clientId = process.env.GOOGLE_CLIENT_ID || '82730443897-ji64k4jhk02lonkps5vu54e1q5opoq3g.apps.googleusercontent.com';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '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';
    const jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret-key';
    const redirectUri = 'https://www.quits.cc/auth/callback';
    
    // Try to import Google APIs
    const { google } = await import('googleapis');
    
    // Create OAuth client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    console.log('OAuth client created successfully');
    
    // Return environment info (safely - no sensitive values)
    return res.status(200).json({
      env: {
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
        SUPABASE_URL: process.env.SUPABASE_URL ? 'yes' : 'no',
        env_key_count: envKeys.length,
        oauth_client_created: true,
        using_hardcoded_fallbacks: !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.JWT_SECRET
      },
      status: 'OK',
      message: 'Auth configuration check completed successfully',
      using_client_id: clientId.substring(0, 10) + '...',
      using_redirect_uri: redirectUri
    });
  } catch (error) {
    console.error('[debug-auth] Error during auth configuration check:', error);
    return res.status(500).json({
      error: 'auth_config_check_failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    });
  }
} 