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
  console.log(`