// Simple serverless handler for Vercel
import express from 'express';
import cors from 'cors';
import { setCorsHeaders } from './cors-middleware.js';
import jsonwebtoken from 'jsonwebtoken';
import { google } from 'googleapis';

// Create Express app
const app = express();

// Configure JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Generate a JWT token - handle both ESM and CJS environments
const generateToken = (payload) => {
  try {
    const jwt = jsonwebtoken;
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  } catch (error) {
    console.error('JWT signing error:', error);
    throw error;
  }
};

// Use CORS middleware with expanded headers
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin
    if (!origin) return callback(null, true);
    
    // Allow specific origins
    if (origin.includes('quits.cc') || origin.includes('localhost')) {
      return callback(null, true);
    }
    
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 
    'X-Requested-With', 
    'Content-Type', 
    'Accept', 
    'Authorization', 
    'Cache-Control',
    'X-Gmail-Token'
  ]
}));

// Parse JSON bodies
app.use(express.json());

// Default route handler
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Quits API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    message: 'API is running'
  });
});

// Test JWT endpoint
app.get('/api/test-jwt', async (req, res) => {
  try {
    const token = generateToken({ test: true, time: new Date().toISOString() });
    res.status(200).json({ 
      success: true, 
      message: 'JWT is working', 
      token,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasJwtSecret: !!process.env.JWT_SECRET,
        runtime: process.version
      }
    });
  } catch (error) {
    console.error('JWT Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'JWT error', 
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  // Return information about the request
  return res.status(200).json({
    success: true,
    message: 'CORS test successful',
    request: {
      headers: req.headers,
      method: req.method,
      url: req.url,
      origin: req.headers.origin || 'none'
    },
    corsHeaders: {
      'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers'),
      'Access-Control-Allow-Credentials': res.getHeader('Access-Control-Allow-Credentials')
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Environment check endpoint
app.get('/api/env-check', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    node_version: process.version,
    vars_configured: {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      JWT_SECRET: !!process.env.JWT_SECRET
    }
  });
});

// Google proxy handler
app.all('/api/google-proxy', async (req, res) => {
  try {
    // Log detailed request info
    console.log('=== Google Proxy Handler ===');
    console.log('Path:', req.url);
    console.log('Method:', req.method);
    console.log('Origin:', req.headers.origin);
    console.log('Query params:', req.query);
    
    // Must have a code query parameter
    const code = req.query.code;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    
    // Try multiple redirect URIs to find the one that works
    const redirectUris = [
      'https://www.quits.cc/auth/callback',
      'https://quits.cc/auth/callback',
      'https://api.quits.cc/api/auth/google/callback',
      'https://api.quits.cc/api/google-proxy'
    ];
    
    let lastError = null;
    let invalidGrantEncountered = false;
    
    // Try each redirect URI
    for (const redirectUri of redirectUris) {
      try {
        console.log(`Trying with redirect URI: ${redirectUri}`);
        
        if (invalidGrantEncountered) {
          console.log('Skipping further attempts due to previous invalid_grant error');
          break;
        }
        
        // Create OAuth client with current redirect URI
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          redirectUri
        );
        
        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        // Get user info
        const oauth2 = google.oauth2('v2');
        const userInfoResponse = await oauth2.userinfo.get({
          auth: oauth2Client,
        });
        const userInfo = userInfoResponse.data;
        
        // Create user data object
        const user = {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name || '',
          picture: userInfo.picture || ''
        };
        
        // Generate JWT token
        const token = generateToken({ 
          id: user.id, 
          email: user.email,
          createdAt: new Date().toISOString()
        });
        
        // Return JSON response
        return res.status(200).json({
          success: true,
          token,
          user,
          redirect_uri_used: redirectUri
        });
      } catch (err) {
        console.log(`Failed with redirect URI ${redirectUri}: ${err.message}`);
        
        lastError = err;
        
        // If it's an invalid_grant error, no point trying other URIs
        if (err.message.includes('invalid_grant')) {
          invalidGrantEncountered = true;
        }
        
        // Only continue to next URI if it's a redirect_uri_mismatch error
        if (!err.message.includes('redirect_uri_mismatch')) {
          break;
        }
      }
    }
    
    // If we get here, all URIs failed
    if (invalidGrantEncountered) {
      return res.status(400).json({
        error: 'Authentication failed',
        message: 'The authorization code has expired or has already been used',
        details: {
          error: 'invalid_grant',
          error_description: 'OAuth codes are single-use and expire quickly'
        }
      });
    }
    
    throw lastError || new Error('Failed to authenticate with all redirect URIs');
  } catch (error) {
    console.error('Google Proxy Error:', error);
    
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: error.response?.data || {}
    });
  }
});

// Email scan endpoint
app.post('/api/email/scan', async (req, res) => {
  // Log request info for debugging
  console.log('Email scan request received');
  console.log('Method:', req.method);
  console.log('Headers present:', {
    'authorization': !!req.headers.authorization,
    'x-gmail-token': !!req.headers['x-gmail-token']
  });
  
  try {
    // Check for required headers
    if (!req.headers.authorization) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No authorization token provided'
      });
    }
    
    if (!req.headers['x-gmail-token']) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Gmail token is required for scanning'
      });
    }
    
    // For now, return a mock success response
    return res.status(200).json({
      success: true,
      message: 'Email scan initiated',
      scanId: 'scan_' + Date.now(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in email scan handler:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// Serverless entry point
export default function handler(req, res) {
  // Apply CORS headers for all requests
  setCorsHeaders(req, res);
  
  // Handle OPTIONS method for preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Log request info
  console.log('Request:', {
    path: req.path,
    method: req.method,
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
  
  // Handle the request with Express
  return app(req, res);
} 