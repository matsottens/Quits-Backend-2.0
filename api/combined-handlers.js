// Combined handlers file to reduce the number of serverless functions
import { setCorsHeaders, handleOptions, getPath } from './utils.js';

// Import debug handler directly
import debugHandler from './debug.js';
import debugEnvHandler from './debug-env.js';

export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Handle OPTIONS preflight
  if (handleOptions(req, res)) {
    return;
  }
  
  // Extract the path
  const path = getPath(req);
  console.log('Combined handler processing path:', path);
  
  // Handle debug endpoint
  if (path === '/api/debug' || path === '/debug') {
    console.log('Routing to debug handler');
    return debugHandler(req, res);
  }
  
  // Handle debug-env endpoint
  if (path === '/api/debug-env' || path === '/debug-env') {
    console.log('Routing to debug-env handler');
    return debugEnvHandler(req, res);
  }
  
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
      timestamp: new Date().toISOString(),
      cors_test: true,
      headers: {
        origin: req.headers.origin || 'none',
        referer: req.headers.referer || 'none',
        'user-agent': req.headers['user-agent'] || 'none'
      }
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