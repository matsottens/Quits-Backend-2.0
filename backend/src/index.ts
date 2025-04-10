import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import emailRoutes from './routes/email.js';
import subscriptionRoutes from './routes/subscription.js';

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

// Middleware to handle CORS for all routes - this should be the FIRST middleware
app.use((req, res, next) => {
  try {
    const origin = req.headers.origin;
    console.log(`Request from origin: ${origin || 'unknown'}`);
    
    // Set CORS headers for all requests
    // Send the exact same origin back in the header to satisfy browser security
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      // Log all headers for debugging
      console.log('Response headers:', res.getHeaders());
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      console.log('Received OPTIONS request - responding with 204');
      return res.status(204).end();
    }
    
    next();
  } catch (error) {
    console.error('Error in CORS middleware:', error);
    next();
  }
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

// Add debugging middleware for all requests
app.use((req, res, next) => {
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 