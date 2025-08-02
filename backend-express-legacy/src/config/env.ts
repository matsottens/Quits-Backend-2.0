import dotenv from 'dotenv';

dotenv.config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  CLIENT_URL: process.env.NODE_ENV === 'production' 
    ? 'https://quits.cc'
    : 'http://localhost:5173',
  API_URL: process.env.NODE_ENV === 'production'
    ? 'https://api.quits.cc'
    : 'http://localhost:3000',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.NODE_ENV === 'production'
    ? 'https://api.quits.cc/auth/google/callback'
    : 'http://localhost:3000/auth/google/callback',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  JWT_SECRET: process.env.JWT_SECRET || 'quits-jwt-secret-key-development',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.NODE_ENV === 'production'
    ? 'https://quits.cc'
    : 'http://localhost:5173',
  VERTEX_PROJECT_ID: process.env.VERTEX_PROJECT_ID || 'quits-2-0',
  VERTEX_LOCATION: process.env.VERTEX_LOCATION || 'us-central1',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY
};

export default env; 