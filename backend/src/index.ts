import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import emailRoutes from './routes/email.js';
import subscriptionRoutes from './routes/subscription.js';
import { handleGoogleCallback } from './routes/googleCallback.js';
import { handleGoogleProxy } from './routes/proxy.js';

// Load environment variables
dotenv.config();

// __dirname is not defined in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

console.log('CLIENT_URL from env:', process.env.CLIENT_URL);

// Add security middleware with customized CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.quits.cc", "https://quits.cc"],
      connectSrc: ["'self'", "https://*.quits.cc", "https://quits.cc", "https://www.quits.cc", "https://api.quits.cc"],
      frameSrc: ["'self'", "https://*.quits.cc"],
      imgSrc: ["'self'", "data:", "https://*.quits.cc", "https://*.googleusercontent.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  // Other helmet options
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Configure CORS with the cors package
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Log original request origin for debugging
    console.log('CORS request from origin:', origin);
    
    // Allow quits.cc domains (both www and non-www) and localhost
    if (origin.includes('quits.cc') || origin.includes('localhost')) {
      console.log('CORS allowed for origin:', origin);
      return callback(null, origin); // Return exactly the requesting origin
    }
    
    console.log('CORS denied for origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cache-Control']
}));

// Add a global CORS middleware that will set headers for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  
  // For all routes, set proper CORS headers to ensure Cache-Control works
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
    
    // For OPTIONS requests, send 200 OK immediately
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  }
  
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Important for parsing application/x-www-form-urlencoded

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Emergency Google OAuth proxy routes - these MUST work
// Add extensive logging to help debug any issues
const googleProxyHandler: RequestHandler = async (req, res, next) => {
  try {
    console.log('[INDEX] /api/google-proxy endpoint hit');
    await handleGoogleProxy(req, res);
  } catch (error) {
    next(error);
  }
};

app.get('/api/google-proxy', googleProxyHandler);
app.post('/api/google-proxy', googleProxyHandler);

// Add a simple test endpoint to verify the server is responding
app.get('/api/test', (req: Request, res: Response) => {
  console.log('[INDEX] Test endpoint hit');
  res.json({ 
    status: 'ok', 
    message: 'Test endpoint is working',
    time: new Date().toISOString(),
    origin: req.headers.origin || 'none'
  });
});

// Serve the test OAuth page
app.get('/test-oauth', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'public', 'test-oauth.html'));
});

// Regular route handlers first
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

// Direct Google callback handlers (not using Router)
const googleCallbackPath = '/api/auth/google/callback';
app.options(googleCallbackPath, function(req, res) {
  return handleGoogleCallbackOptions(req, res);
});
app.get(googleCallbackPath, function(req, res) {
  return handleGoogleCallback(req, res);
});

// CORS test endpoint at the root level
app.get('/cors-test', (req: Request, res: Response) => {
  const origin = req.headers.origin;
  console.log('CORS Test Request:', {
    origin,
    headers: req.headers
  });

  // Return all the headers that were set
  res.json({
    message: 'CORS Test Success',
    origin: origin,
    time: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test OAuth page available at: http://localhost:${PORT}/test-oauth.html`);
}); 