// Combined API Handler for Vercel deployment
// This file consolidates multiple API endpoints to reduce the number of serverless functions

import { createServer } from 'http';
import url from 'url';

// Universal CORS Middleware
function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://www.quits.cc',
    'https://quits.cc',
    'http://localhost:5173', // For local dev
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true; // Request handled
  }
  return false; // Continue to next handler
}

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

// Define simple handlers for basic endpoints
const simpleHandlers = {
  '/api/health': async (req, res) => {
    return res.status(200).json({
      status: 'ok',
      message: 'API is working',
      timestamp: new Date().toISOString()
    });
  }
};

// Define debug handlers map
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

// Load a debug handler dynamically
const getDebugHandler = async (path) => {
  if (debugHandlerMap[path]) {
    try {
      return await debugHandlerMap[path]();
    } catch (error) {
      console.error(`Error loading debug handler for ${path}:`, error);
      return null;
    }
  }
  return null;
};

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
  '/auth/me': () => import('./auth-me.js').then(m => m.default || m), // Allow non-prefixed
  '/api/manual-subscription': () => import('./manual-subscription.js').then(m => m.default || m),
  '/api/email/suggestions': () => import('./email/suggestions.js').then(m => m.default || m),
  '/api/email/scan': () => import('./email/scan.js').then(m => m.default || m),
  '/api/export-subscriptions': () => import('./export-subscriptions.js').then(m => m.default || m),
  '/api/health': () => import('./health.js').then(m => m.default || m),
  '/api/settings': () => import('./settings.js').then(m => m.default || m),
  '/api/account': () => import('./account.js').then(m => m.default || m), // <-- ADDED
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
  if (applyCors(req, res)) {
    return; // CORS preflight handled
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
  console.log(`[combined-handlers] ===== END REQUEST INFO =====`);

  // Handle simple endpoints first
  if (simpleHandlers[path]) {
    console.log(`[combined-handlers] Using simple handler for: ${path}`);
    return await simpleHandlers[path](req, res);
  }

  // Handle debug endpoints
  if (debugHandlerMap[path]) {
    console.log(`[combined-handlers] Using debug handler for: ${path}`);
    const debugHandler = await getDebugHandler(path);
    if (debugHandler) {
      return await debugHandler(req, res);
    }
  }

  // Check if we have a route handler for this path
  if (routeMap[path]) {
    console.log(`[combined-handlers] Found route handler for: ${path}`);
    
    try {
      const handler = await routeMap[path]();
      if (handler) {
        console.log(`[combined-handlers] Executing handler for: ${path}`);
        return await handler(req, res);
      }
    } catch (error) {
      console.error(`[combined-handlers] Error loading handler for ${path}:`, error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to load route handler',
        path: path
      });
    }
  }

  // No handler found
  console.log(`[combined-handlers] No handler found for path: ${path}`);
  return res.status(404).json({ 
    error: 'Not found',
    message: `No handler found for path: ${path}`,
    available_routes: Object.keys(routeMap)
  });
}