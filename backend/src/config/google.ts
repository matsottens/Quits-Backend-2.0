import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  NODE_ENV
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing Google OAuth environment variables');
}

// Ensure the redirect URI matches what's configured in Google Cloud Console
const redirectUri = NODE_ENV === 'production'
  ? 'https://api.quits.cc/api/auth/google/callback'
  : 'http://localhost:3000/api/auth/google/callback';

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  redirectUri
);

// Initialize Gmail API
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Scopes for Gmail API access
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid'
];

export { oauth2Client, gmail, SCOPES }; 