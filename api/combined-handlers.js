// Combined handlers file to reduce the number of serverless functions
import { setCorsHeaders, handleOptions, getPath } from './utils.js';

export default function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Handle OPTIONS preflight
  if (handleOptions(req, res)) {
    return;
  }
  
  // Extract the path
  const path = getPath(req);
  console.log('Combined handler processing path:', path);
  
  // Handle favicon requests
  if (path === '/favicon.ico' || path === '/favicon.png') {
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(204).end();
  }
  
  // Handle root path
  if (path === '/' || path === '') {
    return res.status(200).json({
      message: 'Quits API server is running',
      status: 'ok',
      time: new Date().toISOString(),
      documentation: 'Visit https://www.quits.cc for more information'
    });
  }
  
  // Handle health check
  if (path === '/api/health' || path === '/health') {
    return res.status(200).json({
      status: 'ok',
      message: 'API is working',
      timestamp: new Date().toISOString()
    });
  }
  
  // Handle keepalive endpoint
  if (path === '/api/keepalive' || path === '/keepalive') {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  }
  
  // Default response for any other paths handled by this combined handler
  return res.status(200).json({
    message: 'Combined handler reached',
    path: path,
    time: new Date().toISOString()
  });
} 