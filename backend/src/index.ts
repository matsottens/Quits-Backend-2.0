import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import emailRoutes from './routes/email.js';
import subscriptionRoutes from './routes/subscription.js';
import { Request, Response, NextFunction } from 'express';
import { handleGoogleCallback } from './routes/googleCallback.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

console.log('CLIENT_URL from env:', process.env.CLIENT_URL);

// Simple CORS middleware - no fancy configuration, just set the headers directly
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  console.log(`Request from origin: ${origin || 'unknown'}`);
  
  // Always allow the requesting origin if it's from quits.cc (with or without www)
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(200).end();
  }
  
  next();
});

// Debug middleware to log request headers and CORS headers
app.use((req, res, next) => {
  console.log('Request details:', {
    method: req.method,
    url: req.url,
    path: req.path,
    origin: req.headers.origin,
    host: req.headers.host,
  });
  
  // Log the response headers that were set
  console.log('Response headers:', {
    cors: res.getHeader('Access-Control-Allow-Origin'),
    methods: res.getHeader('Access-Control-Allow-Methods'),
    headers: res.getHeader('Access-Control-Allow-Headers'),
    credentials: res.getHeader('Access-Control-Allow-Credentials')
  });
  
  next();
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP temporarily for debugging
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Important for parsing application/x-www-form-urlencoded

// Special direct route to handle Google callback directly
app.get('/api/auth/google/callback', (req, res) => handleGoogleCallback(req, res));

// Normal routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/subscription', subscriptionRoutes);

// CORS test endpoint at the root level
app.get('/cors-test', (req, res) => {
  const origin = req.headers.origin;
  console.log('CORS Test Request:', {
    origin,
    headers: req.headers
  });

  // Set CORS headers directly on this response
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Return all the headers that were set
  res.json({
    message: 'CORS Test Success',
    origin: origin,
    headers_sent: {
      cors: res.getHeader('Access-Control-Allow-Origin'),
      methods: res.getHeader('Access-Control-Allow-Methods'),
      allowHeaders: res.getHeader('Access-Control-Allow-Headers'),
      credentials: res.getHeader('Access-Control-Allow-Credentials')
    },
    time: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 