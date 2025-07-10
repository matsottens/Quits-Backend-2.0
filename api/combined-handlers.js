// Combined API Handler for Vercel deployment
// This file consolidates multiple API endpoints to reduce the number of serverless functions

import { createServer } from 'http';
import url from 'url';

// Core route handlers
// Note: We'll use dynamic imports for these handlers to avoid circular dependencies
// and to make sure they're only loaded when needed

// Apply CORS middleware
import corsMiddleware from './cors-middleware.js';

// Define the route map with lazy-loaded handlers
const routeMap = {
  // Core API routes
  '/api/scan': () => import('./email-scan.js').then(m => m.default || m),
  '/api/email-scan': () => import('./email-scan.js').then(m => m.default || m),
  '/api/scan-status': () => import('./scan-status.js').then(m => m.default || m),
  '/api/subscription': () => import('./subscription.js').then(m => m.default || m),
  '/api/auth/google/url': () => import('./google-auth-url.js').then(m => m.default || m),
  '/api/auth/google/callback': () => import('./auth-callback.js').then(m => m.default || m),
  '/api/auth/me': () => import('./auth-me.js').then(m => m.default || m),
  '/api/manual-subscription': () => import('./manual-subscription.js').then(m => m.default || m),
  '/api/email/suggestions': () => import('./email/suggestions.js').then(m => m.default || m),
  '/api/email/scan': () => import('./email/scan.js').then(m => m.default || m),
  '/api/export-subscriptions': () => import('./export-subscriptions.js').then(m => m.default || m),
  '/api/health': () => import('./health.js').then(m => m.default || m),
  // New Gemini analysis endpoints
  '/api/analyze-emails': () => import('./analyze-emails.js').then(m => m.default || m),
  '/api/analyzed-subscriptions': () => import('./analyzed-subscriptions.js').then(m => m.default || m)
};

// Cache for loaded handlers
const handlerCache = {};

// The main handler function for the combined API endpoints
export default async function handler(req, res) {
  // Apply CORS middleware
  await corsMiddleware(req, res);
  
  // Parse the request URL
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  
  console.log(`[combined-handlers] Routing request for: ${path}`);
  
  // Find the matching handler for the path
  try {
    const matchedHandler = await findHandler(path);
    
    if (matchedHandler) {
      // Execute the matched handler
      return await matchedHandler(req, res);
    } else {
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
  // Check if handler is already cached
  if (handlerCache[path]) {
    return handlerCache[path];
  }
  
  // Check for exact matches first
  if (routeMap[path]) {
    const handler = await routeMap[path]();
    handlerCache[path] = handler;
    return handler;
  }
  
  // Check for nested path matching (like /api/subscription/123)
  for (const routePath in routeMap) {
    if (path.startsWith(routePath + '/')) {
      const handler = await routeMap[routePath]();
      handlerCache[path] = handler;
      return handler;
    }
  }
  
  return null;
} 