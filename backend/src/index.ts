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

// Configure custom CORS middleware - fixes origin mismatch between www and non-www
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Log the origin for debugging
  console.log('Request with origin:', origin);
  
  // Allow requests with no origin
  if (!origin) return next();
  
  // Check if the origin is allowed
  if (corsOrigins.includes(origin) || 
      origin === 'https://www.quits.cc' || 
      origin === 'https://quits.cc') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  }
  
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