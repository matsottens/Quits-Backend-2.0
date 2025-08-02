import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { handleGoogleProxy } from './routes/proxy.js';
import authRoutes from './routes/auth.js';
import emailRoutes from './routes/email.js';
import subscriptionRoutes from './routes/subscription.js';
import settingsRoutes from './routes/settings.ts';
import accountRoutes from './routes/account.js';

// Create Express app
const app = express();

// Configure CORS
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Allow specific origins
    if (
      origin.includes('quits.cc') || 
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    } else {
      console.log(`CORS blocked for origin: ${origin}`);
      return callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cache-Control']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Emergency Google OAuth proxy routes
const googleProxyHandler = async (req, res, next) => {
  try {
    console.log('[APP] /api/google-proxy endpoint hit');
    await handleGoogleProxy(req, res);
  } catch (error) {
    next(error);
  }
};

// Add explicit OPTIONS handler for the proxy endpoint
app.options('/api/google-proxy', (req, res) => {
  console.log('[APP] OPTIONS for /api/google-proxy');
  const origin = req.headers.origin || '';
  
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    // Set proper CORS headers for preflight request
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    console.log('[APP] CORS headers set for OPTIONS /api/google-proxy');
  }
  
  // Send 204 No Content for OPTIONS requests
  return res.status(204).end();
});

app.get('/api/google-proxy', googleProxyHandler);
app.post('/api/google-proxy', googleProxyHandler);

// Regular route handlers
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/account', accountRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Quits API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Create a serverless-compatible handler
export default function handler(req, res) {
  return new Promise((resolve, reject) => {
    // This mock function captures the end call to resolve the promise
    const originalEnd = res.end;
    res.end = function() {
      originalEnd.apply(res, arguments);
      resolve();
    };
    
    // Handle the request with the Express app
    app(req, res, (err) => {
      if (err) {
        console.error('Express error:', err);
        res.status(500).json({ error: 'Internal server error' });
        resolve();
      }
    });
  });
} 