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

// Debug middleware to log request headers and CORS headers
const debugMiddleware: RequestHandler = (req, res, next) => {
  console.log('Request details:', {
    method: req.method,
    url: req.url,
    path: req.path,
    origin: req.headers.origin,
    host: req.headers.host,
  });
  
  // For OPTIONS requests (CORS preflight), ensure we set the right headers
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      res.status(204).end();
      return;
    }
  }
  
  next();
};

app.use(debugMiddleware);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP temporarily for debugging
}));

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

// Special direct routes to handle Google callback - register all possible patterns
app.get('/api/auth/google/callback', (req: Request, res: Response) => {
  handleGoogleCallback(req, res);
});

app.get('/auth/google/callback', (req: Request, res: Response) => {
  handleGoogleCallback(req, res);
});

// Also handle root-level callback (no /api prefix, no /auth prefix)
app.get('/google/callback', (req: Request, res: Response) => {
  handleGoogleCallback(req, res);
});

// Catch-all pattern to handle any path with google/callback at the end
app.get('*/google/callback', (req: Request, res: Response) => {
  console.log('Wildcard route matched for Google callback:', req.path);
  handleGoogleCallback(req, res);
});

// Normal routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/subscription', subscriptionRoutes);

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