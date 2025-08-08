// Load environment variables **before** any other imports that may rely on them.
// This side-effect module sets process.env from .env.local / .env.
import './load-env.js';

// Simple serverless handler for Vercel - Consolidated API Endpoints
import express from 'express';
import cors from 'cors';
import { setCorsHeaders } from './cors-middleware.js';
import jsonwebtoken from 'jsonwebtoken';
import { google } from 'googleapis';

// Import auth handlers
import signupHandler from './auth/signup.js';
import loginHandler from './auth/login.js';
import forgotPasswordHandler from './auth/forgot-password.js';
import resetPasswordHandler from './auth/reset-password.js';
import meHandler from './auth/me.js';
import verifyHandler from './auth/verify.js';
import settingsHandler from './settings.js';
import googleProxyHandler from './google-proxy.js';
import subscriptionHandler from './subscription.js';
import subscriptionPathHandler from './subscription/[[...path]].js';
import emailScanHandler from './email-scan.js';
import scanStatusHandler from './scan-status.js';
import debugScanStatusHandler from './debug-scan-status.js';

// Wrapper to adapt Express route params to Vercel path handler format
function createPathHandlerWrapper(handler) {
  return async (req, res) => {
    // Transform Express params to Vercel path handler format
    if (req.params.id) {
      // Store the original URL and modify it to include the path format the handler expects
      const originalUrl = req.url;
      req.url = `/subscription/${req.params.id}`;
      
      // Define the query property to include the path array
      Object.defineProperty(req, 'query', {
        value: { path: [req.params.id] },
        writable: true,
        configurable: true
      });
    }
    return handler(req, res);
  };
}

// ---------------------------------------------------------------------------
// Backend target
// ---------------------------------------------------------------------------
// In production we may configure BACKEND_URL explicitly (e.g. a dedicated
// API service).  For local development or simple deployments we fall back to
// the Supabase Edge-Function base derived from SUPABASE_URL so no extra env
// var is required.

export const BACKEND_BASE =
  // 1. Explicit override
  process.env.BACKEND_URL ||
  // 2. Supabase Edge Functions fallback (for self-hosted projects)
  (process.env.SUPABASE_URL
    ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1`
    : null);

if (!BACKEND_BASE) {
  console.warn('[startup] Neither BACKEND_URL nor SUPABASE_URL is set – email scanning proxy will return mock data only.');
} // ---------------------------------------------------------------------------
// Create Express app
export const app = express();

// Configure JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
console.log(`JWT_SECRET loaded. Starts with: ${JWT_SECRET.substring(0, 4)}...`);


// Generate a JWT token - handle both ESM and CJS environments
const generateToken = (payload) => {
  try {
    const jwt = jsonwebtoken;
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  } catch (error) {
    console.error('JWT signing error:', error);
    throw error;
  }
};

// Add a middleware to log all requests
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.url} from origin: ${req.headers.origin || 'unknown'}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// Use CORS middleware with expanded headers
app.use(cors({
  origin: function(origin, callback) {
    // Log all origins for debugging
    console.log('CORS request from origin:', origin);
    
    // Allow requests with no origin
    if (!origin) return callback(null, true);
    
    // Allow specific origins
    if (origin.includes('quits.cc') || origin.includes('localhost')) {
      console.log('CORS allowed for origin:', origin);
      return callback(null, origin); // Return exactly the requesting origin
    }
    
    console.log('CORS denied for origin:', origin);
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
  ],
  maxAge: 86400 // 24 hours
}));

// Explicitly handle all OPTIONS preflight requests (Express 5-safe)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  }
  next();
});

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

// Deprecated inline Google proxy handler (renamed to avoid route clash)
app.all('/__deprecated/google-proxy', async (req, res) => {
  try {
    // Dynamically allow CORS for localhost during development
    const reqOrigin = req.headers.origin || '';
    if (reqOrigin.includes('localhost') || reqOrigin.includes('quits.cc')) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Log detailed request info
    console.log('=== Google Proxy Handler ===');
    console.log('Path:', req.url);
    console.log('Method:', req.method);
    console.log('Origin:', req.headers.origin);
    console.log('Query params:', req.query);
    console.log('Timestamp:', new Date().toISOString());
    
    // Must have a code query parameter
    const code = req.query.code;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    
    // Determine the correct redirect URI: use query parameter if provided, otherwise pick based on host
    let redirectUri = req.query.redirect;
    if (!redirectUri) {
      redirectUri = req.headers.origin && req.headers.origin.includes('localhost')
        ? 'http://localhost:5173/auth/callback'
        : 'https://www.quits.cc/auth/callback';
    }
    console.log(`Using redirect URI: ${redirectUri}`);
    
    try {
      // Create OAuth client with the correct redirect URI
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );
      
      // Log environment info for debugging
      console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasJwtSecret: !!process.env.JWT_SECRET
      });
      
      // Exchange code for tokens
      console.log(`Exchanging code for tokens...`);
      const { tokens } = await oauth2Client.getToken(code);
      console.log('Token exchange successful');
      
      oauth2Client.setCredentials(tokens);
      
      // Get user info
      console.log('Fetching user info...');
      const oauth2 = google.oauth2('v2');
      const userInfoResponse = await oauth2.userinfo.get({
        auth: oauth2Client,
      });
      const userInfo = userInfoResponse.data;
      console.log(`User info received for: ${userInfo.email}`);
      
      // Create user data object
      const user = {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name || '',
        picture: userInfo.picture || ''
      };
      
      // Generate JWT token
      console.log('Generating JWT token...');
      const token = generateToken({ 
        id: user.id, 
        email: user.email,
        gmail_token: tokens.access_token,
        createdAt: new Date().toISOString()
      });
      console.log('JWT token generated successfully');
      
      // Return JSON response
      return res.status(200).json({
        success: true,
        token,
        user,
        redirect_uri_used: redirectUri
      });
    } catch (err) {
      console.log(`Failed with redirect URI ${redirectUri}: ${err.message}`);
      console.log('Error details:', err);
      
      if (err.message.includes('invalid_grant')) {
        return res.status(400).json({
          error: 'Authentication failed',
          message: 'The authorization code has expired or has already been used',
          details: {
            error: 'invalid_grant',
            error_description: 'OAuth codes are single-use and expire quickly'
          }
        });
      }
      
      throw err;
    }
  } catch (error) {
    console.error('Google Proxy Error:', error);
    
    // Provide a user-friendly error message based on the type of error
    let errorMessage = error.message;
    let errorDetails = error.response?.data || {};
    
    if (error.message.includes('invalid_grant')) {
      errorMessage = 'The authorization code has expired or has already been used';
      errorDetails = {
        error: 'invalid_grant',
        error_description: 'Please try logging in again'
      };
    } else if (error.message.includes('redirect_uri_mismatch')) {
      errorMessage = 'OAuth configuration error: redirect URI mismatch';
      errorDetails = {
        error: 'redirect_uri_mismatch',
        error_description: 'The redirect URI in the request does not match the authorized redirect URI'
      };
    }
    
    return res.status(500).json({
      error: 'Authentication failed',
      message: errorMessage,
      details: errorDetails
    });
  }
});

// New shared Google proxy handler (mirrors production logic exactly)
app.all('/api/google-proxy', googleProxyHandler);

// Ensure the email scan endpoint is registered early
app.post('/api/email/scan', emailScanHandler);
app.post('/email/scan', emailScanHandler);
// Preflight for scan routes
app.options('/api/email/scan', (req, res) => res.sendStatus(204));
app.options('/email/scan', (req, res) => res.sendStatus(204));

// Subscription endpoints
app.get('/api/subscription', subscriptionHandler);
app.get('/subscription', subscriptionHandler);
app.get('/api/subscriptions', subscriptionHandler);
app.get('/subscriptions', subscriptionHandler);
app.get('/api/subscription/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.get('/subscription/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.get('/api/subscriptions/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.get('/subscriptions/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.post('/api/subscription', subscriptionHandler);
app.post('/subscription', subscriptionHandler);
app.post('/api/subscriptions', subscriptionHandler);
app.post('/subscriptions', subscriptionHandler);
app.put('/api/subscription/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.put('/subscription/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.put('/api/subscriptions/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.put('/subscriptions/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.delete('/api/subscription/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.delete('/subscription/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.delete('/api/subscriptions/:id', createPathHandlerWrapper(subscriptionPathHandler));
app.delete('/subscriptions/:id', createPathHandlerWrapper(subscriptionPathHandler));

// Email status endpoint mapping
app.get('/api/email/status', scanStatusHandler);
app.get('/email/status', scanStatusHandler);
// Backward/compatibility routes
app.get('/api/scan-status', scanStatusHandler);
app.get('/scan-status', scanStatusHandler);
// Path-param variants for robustness
app.get('/api/email/status/:id', scanStatusHandler);
app.get('/email/status/:id', scanStatusHandler);
// Preflight for status routes
app.options('/api/email/status', (req, res) => res.sendStatus(204));
app.options('/email/status', (req, res) => res.sendStatus(204));
app.options('/api/scan-status', (req, res) => res.sendStatus(204));
app.options('/scan-status', (req, res) => res.sendStatus(204));
// Debug scan status endpoint
app.get('/api/debug-scan-status', debugScanStatusHandler);

// Auth routes
app.post('/api/auth/signup', signupHandler);
app.post('/api/auth/login', loginHandler);
app.post('/api/auth/forgot-password', forgotPasswordHandler);
app.post('/api/auth/reset-password', resetPasswordHandler);
app.get('/api/auth/me', meHandler);
app.get('/api/auth/verify', verifyHandler);

// Settings endpoint
app.get('/api/settings', settingsHandler);
app.put('/api/settings', settingsHandler);

// Handler function for email scanning
async function handleEmailScan(req, res) {
  try {
    // Set proper CORS headers
    setCorsHeaders(req, res);
    
    // Log request details
    console.log('==========================================');
    console.log('Email scan request received at:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('Path:', req.path);
    console.log('URL:', req.url);
    
    // Safely print headers without exposing full token values
    const safeHeaders = {
      'content-type': req.headers['content-type'],
      'origin': req.headers.origin,
    };
    
    if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      safeHeaders.authorization = authHeader.startsWith('Bearer ') 
        ? `Bearer ${authHeader.substring(7, 15)}...` 
        : `${authHeader.substring(0, 8)}...`;
    } else {
      safeHeaders.authorization = 'Not present';
    }
    
    if (req.headers['x-gmail-token']) {
      safeHeaders['x-gmail-token'] = `Present (length: ${req.headers['x-gmail-token'].length})`;
    } else {
      safeHeaders['x-gmail-token'] = 'Not present';
    }
    
    console.log('Headers:', JSON.stringify(safeHeaders));
    console.log('Body:', JSON.stringify(req.body));
    console.log('==========================================');
    
    // Extract and verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('Authorization header missing');
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No authorization token provided'
      });
    }
    
    // Parse token
    let token;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = authHeader; // Accept token without Bearer prefix too
    }
    
    if (!token) {
      console.error('Token format invalid');
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid authorization token format'
      });
    }
    
    // Verify JWT token
    try {
      const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
      req.user = { 
        id: decoded.id,
        email: decoded.email
      };
      
      console.log(`Authenticated user: ${req.user.email}`);
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired token'
      });
    }
    
    // Check for Gmail token in header
    const gmailToken = req.headers['x-gmail-token'];
    const useRealData = !!gmailToken && req.body.useRealData !== false;
    
    // Forward request to the real backend implementation
    if (!BACKEND_BASE) {
      console.warn('[email-scan] BACKEND_BASE undefined – returning mock data');
      return provideMockResponse(res, useRealData, req.user);
    }
    
    // Log the backend base URL being used
    console.log(`Forwarding email scan to: ${BACKEND_BASE}`);

    const scanPath = BACKEND_BASE.includes('api.quits.cc') ? '/api/email/scan' : '/email/scan';
    const forwardResponse = await fetch(`${BACKEND_BASE}${scanPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'X-Gmail-Token': gmailToken || ''
      },
      body: JSON.stringify({
        useRealData: useRealData
      })
    });
    
    if (!forwardResponse.ok) {
      const errorText = await forwardResponse.text();
      console.error(`Backend scan failed with status ${forwardResponse.status}:`, errorText);
      
      // If backend is unavailable, provide mock data as fallback
      if (forwardResponse.status >= 500) {
        console.log('Backend error - using mock data as fallback');
        return provideMockResponse(res, useRealData, req.user);
      }
      
      // Otherwise return the backend error
      return res.status(forwardResponse.status).send(errorText);
    }
    
    const backendData = await forwardResponse.json();
    console.log('Backend scan response:', backendData);
    return res.status(200).json(backendData);
    
  } catch (error) {
    console.error('Error in email scan handler:', error);
    
    // Provide mock data as fallback in case of error
    return provideMockResponse(res, false, req.user);
  }
}

// Fallback function to provide mock response
function provideMockResponse(res, useRealData, user) {
  // Mock subscription data for testing
  const mockSubscriptions = [
    {
      id: "sub_" + Date.now(),
      name: "Netflix",
      price: 14.99,
      billingCycle: "monthly",
      category: "Entertainment",
      nextBillingDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      logo: "https://www.quits.cc/subscription-logos/netflix.png"
    },
    {
      id: "sub_" + (Date.now() + 1),
      name: "Spotify",
      price: 9.99,
      billingCycle: "monthly",
      category: "Music",
      nextBillingDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      logo: "https://www.quits.cc/subscription-logos/spotify.png"
    }
  ];
  
  // Return success response with mock data
  return res.status(200).json({
    success: true,
    message: 'Using mock data (backend unavailable)',
    scanId: 'mock_scan_' + Date.now(),
    timestamp: new Date().toISOString(),
    subscriptions: mockSubscriptions,
    // Include metadata
    meta: {
      usedRealData: false,
      mockData: true,
      userId: user?.id || 'unknown',
      scanDuration: '0.2s',
      emailsProcessed: 0
    }
  });
}

// Handler function for email status
async function handleEmailStatus(req, res) {
  try {
    // Set proper CORS headers
    setCorsHeaders(req, res);
    
    // Extract and verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No authorization token provided'
      });
    }
    
    // Forward request to the real backend implementation
    if (!BACKEND_BASE) {
      return res.status(200).json({ status: 'completed', progress: 100 });
    }

    const statusPath = BACKEND_BASE.includes('api.quits.cc') ? '/api/email/status' : '/email/status';
    const forwardResponse = await fetch(`${BACKEND_BASE}${statusPath}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader
      }
    });
    
    if (!forwardResponse.ok) {
      const errorText = await forwardResponse.text();
      console.error(`Backend status check failed with status ${forwardResponse.status}:`, errorText);
      
      // If backend is unavailable, provide mock status
      if (forwardResponse.status >= 500) {
        return res.status(200).json({
          status: "completed",
          progress: 100,
          total_emails: 50,
          processed_emails: 50
        });
      }
      
      // Otherwise return the backend error
      return res.status(forwardResponse.status).send(errorText);
    }
    
    const backendData = await forwardResponse.json();
    return res.status(200).json(backendData);
    
  } catch (error) {
    console.error('Error in email status handler:', error);
    
    // Mock status in case of error
    return res.status(200).json({
      status: "completed",
      progress: 100,
      total_emails: 50,
      processed_emails: 50
    });
  }
}

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