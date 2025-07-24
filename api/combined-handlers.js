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
  
  // Parse the request URL
  const parsedUrl = url.parse(req.url, true);
  let path = parsedUrl.pathname;

  // Normalize double /api prefix that can happen after Vercel rewrites
  if (path.startsWith('/api/api/')) {
    path = path.replace('/api/api/', '/api/');
  }
  
  console.log(`[combined-handlers] ===== REQUEST RECEIVED =====`);
  console.log(`