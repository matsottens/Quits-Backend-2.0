import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
  throw new Error('Missing Google OAuth environment variables');
}

// Ensure the redirect URI matches the frontend callback URL
const redirectUri = process.env.NODE_ENV === 'production' 
  ? 'https://quits.cc/auth/callback'
  : 'http://localhost:5173/auth/callback';

export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri,
  {
    timeout: 10000,
    responseType: 'code',
    accessType: 'offline',
    prompt: 'consent'
  }
);

// Scopes for Gmail API access
export const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid'
]; 