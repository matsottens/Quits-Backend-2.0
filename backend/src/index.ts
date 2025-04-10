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
const corsOrigins = [
  clientUrl, 
  'https://quits.cc', 
  'https://www.quits.cc'
];

console.log('CORS Origins configured:', corsOrigins);
console.log('CLIENT_URL from env:', process.env.CLIENT_URL);

// Configure explicit CORS middleware
const corsMiddleware = cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    console.log(`Request from origin: ${origin}`);
    
    // Allow all quits.cc domains (with or without www) - crucial for authentication
    if (corsOrigins.includes(origin) || 
        origin === 'https://www.quits.cc' || 
        origin === 'https://quits.cc') {
      console.log(`Allowing origin: ${origin}`);
      callback(null, origin);
    } else {
      console.log(`Blocking origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  maxAge: 86400 // 24 hours in seconds
});

// Apply the CORS middleware to all routes
app.use(corsMiddleware);

// Handle preflight OPTIONS requests separately for more control
app.options('*', (req: Request, res: Response) => {
  console.log('Received OPTIONS request - responding with 204');
  res.status(204).end();
});

// Add debugging middleware for all requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('Request received:', {
    method: req.method,
    url: req.url,
    path: req.path,
    originalUrl: req.originalUrl,
    origin: req.headers.origin,
    referer: req.headers.referer,
    contentType: req.headers['content-type']
  });
  
  // Continue with request processing
  next();
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "connect-src": ["'self'", ...corsOrigins, 'https://*.google.com', 'https://*.googleapis.com', 'https://*.supabase.co'], 
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