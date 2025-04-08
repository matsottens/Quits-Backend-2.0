import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  NODE_ENV
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing Google OAuth environment variables');
}

// Ensure the redirect URI matches what's configured in Google Cloud Console
const redirectUri = NODE_ENV === 'production'
  ? 'https://api.quits.cc/auth/google/callback'
  : GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

export const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  redirectUri
);

// Scopes for Gmail API access
export const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid'
]; 