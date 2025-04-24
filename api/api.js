// Main API Gateway - Unified entry point for API requests
// This file reduces the number of serverless functions by routing all API requests to a single handler

import url from 'url';
import corsMiddleware from './cors-middleware.js';

// Handler cache for better performance
const handlerCache = {};

// Define the simple handlers 
const simpleHandlers = {
  // Health checks and utility endpoints
  '/api/health': async (req, res) => {
    return res.status(200).json({
      status: 'ok',
      message: 'API is working',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown'
    });
  },
  '/api/keepalive': async (req, res) => {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  },
  '/api': async (req, res) => {
    return res.status(200).json({
      message: 'Quits API server is running',
      status: 'ok',
      time: new Date().toISOString(),
      documentation: 'Visit https://www.quits.cc for more information'
    });
  },
  '/favicon.ico': async (req, res) => {
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(204).end();
  }
};

// Define the debug handlers map with dynamic imports
const debugHandlerMap = {
  '/api/debug': () => import('./debug.js').then(m => m.default || m),
  '/api/debug-env': () => import('./debug-env.js').then(m => m.default || m),
  '/api/debug-google-token': () => import('./debug-google-token.js').then(m => m.default || m),
  '/api/debug-gmail': () => import('./debug-gmail.js').then(m => m.default || m),
  '/api/debug-scan': () => import('./debug-scan.js').then(m => m.default || m),
  '/api/debug-subscriptions': () => import('./debug-subscriptions.js').then(m => m.default || m),
  '/api/debug-gemini': () => import('./debug-gemini.js').then(m => m.default || m),
  '/api/debug-supabase': () => import('./debug-supabase.js').then(m => m.default || m),
  '/api/restart-oauth': () => import('./restart-oauth.js').then(m => m.default || m)
};

// Load a combined handler dynamically
const getCombinedHandler = async () => {
  if (handlerCache.combinedHandler) {
    return handlerCache.combinedHandler;
  }
  
  try {
    const module = await import('./combined-handlers.js');
    handlerCache.combinedHandler = module.default || module;
    return handlerCache.combinedHandler;
  } catch (error) {
    console.error('Error loading combined handler:', error);
    return null;
  }
};

// Load a debug handler dynamically
const getDebugHandler = async (path) => {
  // Check cache first
  if (handlerCache[path]) {
    return handlerCache[path];
  }
  
  // Load the handler dynamically
  if (debugHandlerMap[path]) {
    try {
      const handler = await debugHandlerMap[path]();
      handlerCache[path] = handler;
      return handler;
    } catch (error) {
      console.error(`Error loading debug handler for ${path}:`, error);
      return null;
    }
  }
  
  return null;
};

export default async function handler(req, res) {
  try {
    // Apply CORS middleware first
    await corsMiddleware(req, res);
    
    // Parse the URL
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    
    console.log(`[api] Request received for: ${path}`);
    
    // Handle simple/static responses first
    if (simpleHandlers[path]) {
      return await simpleHandlers[path](req, res);
    }
    
    // Handle debug endpoints
    if (debugHandlerMap[path]) {
      const debugHandler = await getDebugHandler(path);
      if (debugHandler) {
        return await debugHandler(req, res);
      }
    }
    
    // For all other API routes, use the combined handler
    const combinedHandler = await getCombinedHandler();
    if (combinedHandler) {
      return await combinedHandler(req, res);
    }
    
    // If we get here, no handler was found
    return res.status(404).json({
      error: 'Not Found',
      message: `No API handler found for path: ${path}`
    });
  } catch (error) {
    console.error('Unhandled error in API gateway:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'An unexpected error occurred'
    });
  }
} 