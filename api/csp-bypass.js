import { setCorsHeaders } from './cors-middleware.js';

// Custom endpoint to serve a relaxed CSP for frontend
export default function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Bypass CSP to allow external fonts
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "connect-src 'self' https://api.quits.cc; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: https:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
  );
  
  // Send back headers that should be used in the frontend
  res.status(200).json({
    status: 'ok',
    message: 'CSP headers provided',
    headers: {
      'Content-Security-Policy': res.getHeader('Content-Security-Policy'),
      'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin')
    }
  });
} 