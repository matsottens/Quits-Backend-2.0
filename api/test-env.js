// Test environment variables access
import { setCorsHeaders } from './utils.js';

export default function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Log all environment variables for debugging
  console.log('ALL ENV VARIABLES DIAGNOSTIC:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
  console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set (not showing for security)' : 'Not set');
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set (not showing for security)' : 'Not set');
  console.log('PORT:', process.env.PORT);
  console.log('CLIENT_URL:', process.env.CLIENT_URL);
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('JWT_EXPIRES_IN:', process.env.JWT_EXPIRES_IN);
  console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
  
  // Print out env key names (without values for security)
  const envKeys = Object.keys(process.env).sort();
  
  // Return environment variables (safely)
  res.status(200).json({
    env: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
      has_google_id: process.env.GOOGLE_CLIENT_ID ? 'yes' : 'no',
      google_id_length: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.length : 0,
      has_google_secret: process.env.GOOGLE_CLIENT_SECRET ? 'yes' : 'no',
      google_secret_length: process.env.GOOGLE_CLIENT_SECRET ? process.env.GOOGLE_CLIENT_SECRET.length : 0,
      has_jwt_secret: process.env.JWT_SECRET ? 'yes' : 'no',
      jwt_secret_length: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
      redirect_uri: 'https://www.quits.cc/auth/callback',
      alt_redirect_uri: 'https://quits.cc/auth/callback',
      env_key_names: envKeys,
      all_env_keys_count: envKeys.length,
      CLIENT_URL: process.env.CLIENT_URL || 'not set',
      PORT: process.env.PORT || 'not set',
      CORS_ORIGIN: process.env.CORS_ORIGIN || 'not set'
    }
  });
} 