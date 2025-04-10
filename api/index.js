import { setCorsHeaders } from './cors-middleware.js';

export default function handler(req, res) {
  // Handle CORS with shared middleware
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return corsResult; // Return early if it was an OPTIONS request
  
  // Return basic API info
  res.status(200).json({
    name: 'Quits API',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || 'none',
    endpoints: [
      '/api/health',
      '/api/test',
      '/api/google-proxy',
      '/api/auth/google',
      '/api/auth/google/callback'
    ]
  });
} 