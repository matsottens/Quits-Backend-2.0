// Debug environment variables without exposing secrets
import { setCorsHeaders } from './utils.js';

export default function handler(req, res) {
  // Set CORS headers for preflight requests
  setCorsHeaders(req, res);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // More detailed logging for debugging
  console.log('Debug-env endpoint called');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
  console.log('GOOGLE_CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET present:', !!process.env.GOOGLE_CLIENT_SECRET);
  console.log('JWT_SECRET present:', !!process.env.JWT_SECRET);
  
  // Check if Google client ID is valid format
  const googleClientIdPattern = /^\d+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/;
  const clientIdValid = process.env.GOOGLE_CLIENT_ID && 
                        googleClientIdPattern.test(process.env.GOOGLE_CLIENT_ID);
  
  // Check which environment variables are set (only report existence, not values)
  const environmentInfo = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 
      `Set (length: ${process.env.GOOGLE_CLIENT_ID.length}, valid format: ${clientIdValid})` : 
      "Not found",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 
      `Set (length: ${process.env.GOOGLE_CLIENT_SECRET.length})` : 
      "Not found",
    JWT_SECRET: process.env.JWT_SECRET ? 
      `Set (length: ${process.env.JWT_SECRET.length})` : 
      "Not found",
    NODE_ENV: process.env.NODE_ENV || "Not set",
    VERCEL_ENV: process.env.VERCEL_ENV || "Not set",
    VERCEL_URL: process.env.VERCEL_URL || "Not set",
    BACKEND_URL: process.env.BACKEND_URL || "Not set",
    CLIENT_URL: process.env.CLIENT_URL || "Not set",
    CORS_ORIGIN: process.env.CORS_ORIGIN || "Not set"
  };
  
  // Additional system info
  const systemInfo = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime()
  };
  
  // Return the environment info
  return res.status(200).json({
    message: "Environment variables status",
    environment: environmentInfo,
    system: systemInfo,
    fallbackValues: {
      clientId: '82730443897-ji64k4jhk02lonkps5vu54e1q5opoq3g.apps.googleusercontent.com',
      usingFallbacks: !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.JWT_SECRET
    }
  });
} 