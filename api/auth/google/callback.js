import { handleGoogleCallback } from '../../../backend/src/routes/googleCallback.js';

export default function handler(req, res) {
  console.log('Vercel Serverless Function - Google OAuth Callback hit');
  console.log('Request path:', req.url);
  console.log('Request headers:', req.headers);
  
  // Set CORS headers for all responses
  const origin = req.headers.origin || '';
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  }
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  return handleGoogleCallback(req, res);
} 