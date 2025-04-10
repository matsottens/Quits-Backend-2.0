import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import emailRoutes from './routes/email.js';
import subscriptionRoutes from './routes/subscription.js';
import { Request, Response, NextFunction } from 'express';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

console.log('CLIENT_URL from env:', process.env.CLIENT_URL);

// Simple CORS middleware - no fancy configuration, just set the headers directly
app.use((req: Request, res: Response, next: NextFunction) => {
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
app.use((req: Request, res: Response, next: NextFunction) => {
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
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "connect-src": ["'self'", 'https://quits.cc', 'https://www.quits.cc', 'https://*.google.com', 'https://*.googleapis.com', 'https://*.supabase.co'], 
      "frame-src": ["'self'", 'https://accounts.google.com/'], // Allow Google sign-in frames
      "script-src": ["'self'", "'unsafe-inline'"], // Adjust as needed, unsafe-inline might be needed for some libraries
      "img-src": ["'self'", "data:", "https:"] // Allow images from self, data URLs, and https
    }
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Important for parsing application/x-www-form-urlencoded

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 