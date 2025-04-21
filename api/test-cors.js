// Simple test endpoint to check if CORS is working
import { handleCors, setCorsHeaders, getPath } from './middleware.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (handleCors(req, res)) {
    return; // If it was an OPTIONS request, we're done
  }
  
  // Log basic request information for debugging
  const path = getPath(req);
  console.log(`CORS Test Handler - Processing ${req.method} request for: ${path}`);
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  // Return information about the request and CORS setup
  return res.status(200).json({
    success: true,
    message: 'CORS test successful',
    request: {
      method: req.method,
      path: path,
      headers: {
        // Include safe headers for debugging
        'content-type': req.headers['content-type'],
        'origin': req.headers['origin'],
        'user-agent': req.headers['user-agent']
      }
    },
    cors: {
      allowed_origin: 'https://www.quits.cc',
      allowed_methods: 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
      allowed_credentials: true
    },
    environment: process.env.NODE_ENV || 'development'
  });
} 