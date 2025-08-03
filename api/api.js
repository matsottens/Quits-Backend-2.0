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

// Function to extract the original path from Vercel rewrite
function extractOriginalPath(req, parsedUrl) {
  let path = parsedUrl.pathname;
  
  console.log(`[api] extractOriginalPath called with path: ${path}`);
  console.log(`[api] req.url: ${req.url}`);
  console.log(`[api] All headers:`, req.headers);
  
  // If we're at the api.js endpoint, we need to reconstruct the original path
  if (path === '/api/api.js') {
    // Method 1: Check for Vercel-specific headers
    const originalPath = req.headers['x-vercel-original-path'] || 
                        req.headers['x-original-path'] ||
                        req.headers['x-vercel-rewrite-path'];
    
    if (originalPath) {
      console.log(`[api] Found original path in headers: ${originalPath}`);
      return originalPath;
    }
    
    // Method 2: Try to extract from the host header and referer
    const host = req.headers.host;
    const referer = req.headers.referer;
    
    if (referer && host) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.hostname === host.split(':')[0]) {
          const refererPath = refererUrl.pathname;
          if (refererPath.startsWith('/api/')) {
            console.log(`[api] Extracted path from referer: ${refererPath}`);
            return refererPath;
          }
        }
      } catch (e) {
        console.log(`[api] Could not parse referer URL: ${referer}`);
      }
    }
    
    // Method 3: Try to get from the original URL if available
    const originalUrl = req.headers['x-vercel-original-url'] || req.url;
    if (originalUrl && originalUrl !== req.url) {
      try {
        const originalParsed = url.parse(originalUrl);
        if (originalParsed.pathname && originalParsed.pathname.startsWith('/api/')) {
          console.log(`[api] Extracted path from original URL: ${originalParsed.pathname}`);
          return originalParsed.pathname;
        }
      } catch (e) {
        console.log(`[api] Could not parse original URL: ${originalUrl}`);
      }
    }
    
    // Method 4: For auth routes, try to reconstruct based on the request
    if (req.method === 'POST' && req.body) {
      // If this is a POST request, it might be a signup/login
      console.log(`[api] POST request detected, checking body for auth clues`);
      if (req.body.email && req.body.password) {
        console.log(`[api] Detected auth request with email/password`);
        // This is likely a signup or login request
        return '/api/auth/signup'; // Default to signup, login will be handled by the auth handler
      }
    }
    
    // Method 5: Fallback - try to reconstruct from the request context
    console.log(`[api] Could not determine original path, using fallback`);
    return '/api/unknown';
  }
  
  return path;
}

export default async function handler(req, res) {
  try {
    // Apply CORS middleware first
    await corsMiddleware(req, res);
    
    // Parse the URL
    const parsedUrl = url.parse(req.url, true);
    let path = extractOriginalPath(req, parsedUrl);
    
    console.log(`[api] Request received for: ${path}`);
    console.log(`[api] Original URL: ${req.url}`);
    console.log(`[api] Query params:`, parsedUrl.query);
    console.log(`[api] Headers:`, Object.keys(req.headers));
    console.log(`[api] Host: ${req.headers.host}`);
    console.log(`[api] Referer: ${req.headers.referer}`);
    
    // Handle auth routes directly first
    if (req.method === 'POST' && req.body && req.body.email && req.body.password) {
      // Check if this is specifically a signup request
      const contentType = req.headers['content-type'] || '';
      const userAgent = req.headers['user-agent'] || '';
      const referer = req.headers.referer || '';
      
      // Look for signup-specific indicators
      const isSignupRequest = 
        referer.includes('/signup') ||
        userAgent.includes('signup') ||
        (req.body.name && !req.body.token); // Signup typically has name, login doesn't
      
      if (isSignupRequest) {
        console.log(`[api] Detected signup request, routing to signup handler`);
        const signupHandler = (await import('./auth/signup.js')).default;
        return await signupHandler(req, res);
      } else {
        console.log(`[api] Detected login request, routing to login handler`);
        const loginHandler = (await import('./auth/login.js')).default;
        return await loginHandler(req, res);
      }
    }
    
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
      message: `No API handler found for path: ${path}`,
      debug: {
        originalUrl: req.url,
        parsedPath: parsedUrl.pathname,
        reconstructedPath: path,
        queryParams: parsedUrl.query,
        headers: Object.keys(req.headers),
        host: req.headers.host,
        referer: req.headers.referer
      }
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