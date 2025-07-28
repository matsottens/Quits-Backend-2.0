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
  '/api/scan': () => import('./email-scan.js').then(m => m.default || m),
  '/api/email-scan': () => import('./email-scan.js').then(m => m.default || m),
  '/api/scan-status': () => import('./scan-status.js').then(m => m.default || m),
  '/api/email/status': () => import('./scan-status.js').then(m => m.default || m),
  // Route all /api/subscription and /api/subscription/[id] to the catch-all handler
  '/api/subscription': () => import('./subscription/[[...path]].js').then(m => m.default || m),
  '/api/subscriptions': () => import('./subscription/[[...path]].js').then(m => m.default || m),
  '/api/auth/google/url': () => import('./google-auth-url.js').then(m => m.default || m),
  '/api/auth/google/callback': () => import('./auth-callback.js').then(m => m.default || m),
  '/api/auth/me': () => import('./auth-me.js').then(m => m.default || m),
  '/api/manual-subscription': () => import('./manual-subscription.js').then(m => m.default || m),
  '/api/email/suggestions': () => import('./email/suggestions.js').then(m => m.default || m),
  '/api/email/scan': () => import('./email/scan.js').then(m => m.default || m),
  '/api/export-subscriptions': () => import('./export-subscriptions.js').then(m => m.default || m),
  '/api/health': () => import('./health.js').then(m => m.default || m),
  '/api/settings': () => import('./settings.js').then(m => m.default || m),
  // New Gemini analysis endpoints
  '/api/analyze-emails': () => import('./analyze-emails.js').then(m => m.default || m),
  '/api/analyzed-subscriptions': () => import('./analyzed-subscriptions.js').then(m => m.default || m),
  '/api/trigger-gemini-scan': () => import('./trigger-gemini-scan.js').then(m => m.default || m),
  // Debug endpoints
  '/api/debug-scan-status': () => import('./debug-scan-status.js').then(m => m.default || m),
  '/api/check-gemini-quota': () => import('./check-gemini-quota.js').then(m => m.default || m),
  // Auth routes - handle both with and without /api prefix due to Vercel path stripping
  '/api/auth/signup': () => import('./auth/signup.js').then(m => m.default || m),
  '/auth/signup': () => import('./auth/signup.js').then(m => m.default || m),
  '/api/auth/login': () => import('./auth/login.js').then(m => m.default || m),
  '/auth/login': () => import('./auth/login.js').then(m => m.default || m),
  '/api/auth/forgot-password': () => import('./auth/forgot-password.js').then(m => m.default || m),
  '/auth/forgot-password': () => import('./auth/forgot-password.js').then(m => m.default || m),
  '/api/auth/reset-password': () => import('./auth/reset-password.js').then(m => m.default || m),
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
  
  console.log(`[combined-handlers] Body parsing completed`);
  console.log(`[combined-handlers] Request body:`, req.body);
  console.log(`[combined-handlers] Content-Type:`, req.headers['content-type']);
  
  // Parse the request URL
  const parsedUrl = url.parse(req.url, true);
  let path = parsedUrl.pathname;

  // Enhanced path normalization for Vercel rewrites
  console.log(`[combined-handlers] ===== REQUEST RECEIVED =====`);
  console.log(`[combined-handlers] Original path: ${path}`);
  console.log(`[combined-handlers] Method: ${req.method}`);
  console.log(`[combined-handlers] URL: ${req.url}`);
  console.log(`[combined-handlers] Query params:`, parsedUrl.query);
  console.log(`[combined-handlers] Headers:`, Object.keys(req.headers));
  console.log(`[combined-handlers] Origin: ${req.headers.origin}`);
  console.log(`[combined-handlers] Referer: ${req.headers.referer}`);

  // The path should already be normalized by api.js, but let's handle edge cases
  if (path.startsWith('/api/api/')) {
    // Double /api prefix from Vercel rewrites
    path = path.replace('/api/api/', '/api/');
    console.log(`[combined-handlers] Fixed double /api prefix: ${path}`);
  }

  console.log(`[combined-handlers] Final normalized path: ${path}`);

  // Special handling for trigger-gemini-scan endpoint
  if (path === '/api/trigger-gemini-scan') {
    console.log(`[combined-handlers] === TRIGGER-GEMINI-SCAN SPECIAL HANDLING ===`);
    console.log(`[combined-handlers] Method: ${req.method}`);
    console.log(`[combined-handlers] Body:`, req.body);
    console.log(`[combined-handlers] Query:`, parsedUrl.query);
  }

  try {
    const matchedHandler = await findHandler(path);

    if (matchedHandler) {
      console.log(`[combined-handlers] Found handler for path: ${path}`);
      return await matchedHandler(req, res);
    }

    console.log(`[combined-handlers] No handler found for path: ${path}`);
    console.log(`[combined-handlers] Available routes:`, Object.keys(routeMap));
    return res.status(404).json({ 
      error: 'API endpoint not found',
      debug: {
        requestedPath: path,
        originalUrl: req.url,
        availableRoutes: Object.keys(routeMap),
        queryParams: parsedUrl.query
      }
    });
  } catch (error) {
    console.error(`[combined-handlers] Error executing handler for ${path}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper to load the appropriate handler
async function findHandler(path) {
  console.log(`[combined-handlers] findHandler called for path: ${path}`);

  // Cached?
  if (handlerCache[path]) {
    return handlerCache[path];
  }

  // Exact match
  if (routeMap[path]) {
    const handler = await routeMap[path]();
    handlerCache[path] = handler;
    return handler;
  }

  // Nested match (e.g., /api/subscription/123)
  for (const routePath in routeMap) {
    if (path.startsWith(routePath + '/')) {
      const handler = await routeMap[routePath]();
      handlerCache[path] = handler;
      return handler;
    }
  }

  return null;
}