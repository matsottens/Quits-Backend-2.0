import { setCorsHeaders } from './cors-middleware.js';

export default function handler(req, res) {
  // Handle CORS with shared middleware
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return corsResult; // Return early if it was an OPTIONS request
  
  // Return health status
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    time: new Date().toISOString(),
    origin: req.headers.origin || 'none'
  });
} 