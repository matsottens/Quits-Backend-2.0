// Debug Environment Variables endpoint
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Check for OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Prepare environment information without exposing actual secrets
  const envInfo = {
    // Google OAuth config
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 
      `${process.env.GOOGLE_CLIENT_ID.substring(0, 8)}...${process.env.GOOGLE_CLIENT_ID.substring(process.env.GOOGLE_CLIENT_ID.length - 5)}` : 
      'Not set',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 
      `${process.env.GOOGLE_CLIENT_SECRET.substring(0, 5)}...` : 
      'Not set',
    JWT_SECRET: process.env.JWT_SECRET ? 
      `Present (${process.env.JWT_SECRET.length} chars)` : 
      'Not set',
    
    // Environment settings
    NODE_ENV: process.env.NODE_ENV || 'Not set',
    VERCEL_ENV: process.env.VERCEL_ENV || 'Not set',
    CLIENT_URL: process.env.CLIENT_URL || 'Not set',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'Not set',
    
    // Runtime info
    serverTime: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
  };
  
  // Return the environment information
  return res.status(200).json({
    message: 'Debug environment information',
    environment: envInfo,
    requestHeaders: {
      accept: req.headers.accept,
      'user-agent': req.headers['user-agent'],
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer,
    },
  });
} 