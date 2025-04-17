// Simple serverless handler for Vercel
import express from 'express';
import cors from 'cors';
import { setCorsHeaders } from './cors-middleware.js';
import jsonwebtoken from 'jsonwebtoken';

// Create Express app
const app = express();

// Configure JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Generate a JWT token - handle both ESM and CJS environments
const generateToken = async (payload) => {
  const jwt = jsonwebtoken;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
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
    const token = await generateToken({ test: true, time: new Date().toISOString() });
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

// CORS test endpoint - useful for debugging CORS issues
app.options('/api/cors-test', (req, res) => {
  setCorsHeaders(req, res);
  return res.status(204).end();
});

app.get('/api/cors-test', (req, res) => {
  // Apply CORS headers
  setCorsHeaders(req, res);
  
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

// Serverless entry point
export default function handler(req, res) {
  // Apply CORS headers
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return;
  
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