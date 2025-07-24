// Combined API Handler for Vercel deployment
// This file consolidates multiple API endpoints to reduce the number of serverless functions

import { createServer } from 'http';
import url from 'url';

// Core route handlers
// Note: We'll use dynamic imports for these handlers to avoid circular dependencies
// and to make sure they're only loaded when needed

// Apply CORS middleware
import corsMiddleware from './cors-middleware.js';

// Simple body parser for JSON requests
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      resolve();
      return;
    }
    
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch (e) {
          req.body = body; // Keep as string if not valid JSON
        }
      }
      resolve();
    });
  });
}

// Define the route map with lazy-loaded handlers
const routeMap = {
  // Core API routes
  '/scan': () => import('./email-scan.js').then(m => m.default || m),
  '/email-scan': () => import('./email-scan.js').then(m => m.default || m),
  '/scan-status': () => import('./scan-status.js').then(m => m.default || m),
  '/email/status': () => import('./scan-status.js').then(m => m.default || m),
  // Route all /api/subscription and /api/subscription/[id] to the catch-all handler
  '/subscription': () => import('./subscription/[[...path]].js').then(m => m.default || m),
  '/subscriptions': () => import('./subscription/[[...path]].js').then(m => m.default || m),
  '/auth/google/url': () => import('./google-auth-url.js').then(m => m.default || m),
  '/auth/google/callback': () => import('./auth-callback.js').then(m => m.default || m),
  '/auth/me': () => import('./auth-me.js').then(m => m.default || m),
  '/manual-subscription': () => import('./manual-subscription.js').then(m => m.default || m),
  '/email/suggestions': () => import('./email/suggestions.js').then(m => m.default || m),
  '/email/scan': () => import('./email/scan.js').then(m => m.default || m),
  '/export-subscriptions': () => import('./export-subscriptions.js').then(m => m.default || m),
  '/health': () => import('./health.js').then(m => m.default || m),
  // New Gemini analysis endpoints
  '/analyze-emails': () => import('./analyze-emails.js').then(m => m.default || m),
  '/analyzed-subscriptions': () => import('./analyzed-subscriptions.js').then(m => m.default || m),
  '/trigger-gemini-scan': () => import('./trigger-gemini-scan.js').then(m => m.default || m),
  // Debug endpoints
  '/debug-scan-status': () => import('./debug-scan-status.js').then(m => m.default || m),
  '/check-gemini-quota': () => import('./check-gemini-quota.js').then(m => m.default || m),
  '/auth/signup': () => import('./auth/signup.js').then(m => m.default || m),
  '/auth/login': () => import('./auth/login.js').then(m => m.default || m),
  '/auth/forgot-password': () => import('./auth/forgot-password.js').then(m => m.default || m),
  '/auth/reset-password': () => import('./auth/reset-password.js').then(m => m.default || m)
};

// Cache for loaded handlers
const handlerCache = {};

// The main handler function for the combined API endpoints
export default async function handler(req, res) {
  // Apply CORS middleware
  const corsHandled = await corsMiddleware(req, res);
  
  // If CORS middleware handled the request (e.g., OPTIONS preflight), return early
  if (corsHandled) {
    console.log(`[combined-handlers] CORS middleware handled the request, returning early`);
    return;
  }
  
  // Parse request body for non-GET requests
  await parseBody(req);
  
  // Parse the request URL
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  
  console.log(`[combined-handlers] ===== REQUEST RECEIVED =====`);
  console.log(`[combined-handlers] Path: ${path}`);
  console.log(`[combined-handlers] Method: ${req.method}`);
  console.log(`[combined-handlers] URL: ${req.url}`);
  console.log(`[combined-handlers] Headers:`, Object.keys(req.headers));
  console.log(`[combined-handlers] User-Agent: ${req.headers['user-agent']}`);
  console.log(`[combined-handlers] Origin: ${req.headers.origin}`);
  console.log(`[combined-handlers] Referer: ${req.headers.referer}`);
  
  // Special handling for trigger-gemini-scan endpoint
  if (path === '/api/trigger-gemini-scan') {
    console.log(`[combined-handlers] === TRIGGER-GEMINI-SCAN SPECIAL HANDLING ===`);
    console.log(`[combined-handlers] Method: ${req.method}`);
    console.log(`[combined-handlers] Body:`, req.body);
    console.log(`[combined-handlers] Query:`, parsedUrl.query);
  }
  
  // Find the matching handler for the path
  try {
    const matchedHandler = await findHandler(path);
    
    if (matchedHandler) {
      console.log(`[combined-handlers] Found handler for path: ${path}`);
      // Execute the matched handler
      return await matchedHandler(req, res);
    } else {
      console.log(`[combined-handlers] No handler found for path: ${path}`);
      // No handler found for this path
      return res.status(404).json({ error: 'API endpoint not found' });
    }
  } catch (error) {
    console.error(`[combined-handlers] Error executing handler for ${path}:`, error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong' 
    });
  }
}

// Function to find and load the appropriate handler for a given path
async function findHandler(path) {
  console.log(`[combined-handlers] findHandler called for path: ${path}`);
  
  // Check if handler is already cached
  if (handlerCache[path]) {
    console.log(`[combined-handlers] Using cached handler for: ${path}`);
    return handlerCache[path];
  }
  
  // Check for exact matches first
  if (routeMap[path]) {
    console.log(`[combined-handlers] Found exact match for: ${path}`);
    console.log(`[combined-handlers] Loading handler from routeMap[${path}]`);
    try {
      const handler = await routeMap[path]();
      console.log(`[combined-handlers] Handler loaded successfully for: ${path}`);
      console.log(`[combined-handlers] Handler type:`, typeof handler);
      console.log(`[combined-handlers] Handler keys:`, Object.keys(handler || {}));
      handlerCache[path] = handler;
      return handler;
    } catch (error) {
      console.error(`[combined-handlers] Error loading handler for ${path}:`, error);
      throw error;
    }
  }
  
  // Check for nested path matching (like /api/subscription/123)
  for (const routePath in routeMap) {
    if (path.startsWith(routePath + '/')) {
      console.log(`[combined-handlers] Found nested match: ${path} starts with ${routePath}/`);
      const handler = await routeMap[routePath]();
      handlerCache[path] = handler;
      return handler;
    }
  }
  
  console.log(`[combined-handlers] No handler found for: ${path}`);
  console.log(`[combined-handlers] Available routes:`, Object.keys(routeMap));
  return null;
} 