// Health check endpoint
import { setCorsHeaders } from './utils.js';

export default async function handler(req, res) {
  // Set CORS headers for all response types
  setCorsHeaders(req, res);
  
  // Add explicit CORS headers (redundant but being extra safe)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Prepare response data
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: {
      environment: process.env.NODE_ENV || 'development',
      vercel_env: process.env.VERCEL_ENV || 'development',
      region: process.env.VERCEL_REGION || 'unknown',
      nodejs: process.version,
      memory: process.memoryUsage()
    },
    request: {
      headers: req.headers,
      ip: req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      path: req.url,
      method: req.method
    }
  };
  
  // Check if modules are available
  try {
    await import('googleapis');
    healthData.modules = {
      googleapis: true
    };
  } catch (e) {
    healthData.modules = {
      googleapis: false,
      error: e.message
    };
  }
  
  // Test connectivity to Google APIs
  try {
    const fetch = globalThis.fetch || (await import('node-fetch')).default;
    const googleResponse = await fetch('https://accounts.google.com', {
      method: 'HEAD',
      timeout: 5000 // 5 second timeout
    });
    
    healthData.connectivity = {
      google: googleResponse.ok,
      google_status: googleResponse.status
    };
  } catch (e) {
    healthData.connectivity = {
      google: false,
      error: e.message
    };
  }
  
  return res.status(200).json(healthData);
} 