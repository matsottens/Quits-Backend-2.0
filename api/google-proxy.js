import { handleGoogleProxy } from '../backend/src/routes/proxy.js';

export default function handler(req, res) {
  console.log('Vercel Serverless Function - Google OAuth Proxy hit');
  console.log('Request path:', req.url);
  
  // Set CORS headers for all responses
  const origin = req.headers.origin || '';
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    console.log('Set CORS headers for origin:', origin);
  }
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  console.log('Forwarding to proxy handler...');
  return handleGoogleProxy(req, res);
} 