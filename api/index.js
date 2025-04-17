// Simple serverless handler for Vercel
import express from 'express';
import cors from 'cors';
import { setCorsHeaders } from './cors-middleware.js';

// Create Express app
const app = express();

// Use CORS middleware
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
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cache-Control']
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

// Serverless entry point
export default function handler(req, res) {
  // Apply CORS headers
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return;
  
  // Handle the request with Express
  return app(req, res);
} 