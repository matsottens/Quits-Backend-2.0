// Google OAuth Proxy - Simplified handler to avoid path-to-regexp issues
import { setCorsHeaders, getPath } from './utils.js';

export default function handler(req, res) {
  // Always set CORS headers explicitly for all response types
  setCorsHeaders(req, res);
  
  // Handle preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for Google proxy');
    return res.status(204).end();
  }
  
  const path = getPath(req);
  console.log('Google Proxy Handler - Processing request for path:', path);
  console.log('Method:', req.method);
  console.log('Origin:', req.headers.origin);
  console.log('Query params:', req.query);
  
  // Extract code from query parameters
  const { code, redirect, _t } = req.query;
  
  if (!code) {
    console.log('Error: Missing authorization code');
    return res.status(400).json({ 
      error: 'Missing authorization code',
      details: 'The authorization code is required for the Google OAuth flow'
    });
  }
  
  try {
    // Add no-cache headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // Add check for Accept header to determine response format
    const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
    
    // If the client wants JSON, return directly with a message instead of redirecting
    if (wantsJson) {
      console.log('Client requested JSON response, returning pending status');
      
      // Always include the redirect parameter if provided
      const params = new URLSearchParams(req.query);
      
      // Redirect to the main backend handler but don't wait for the response
      const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
      const redirectUrl = backendUrl + '?' + params.toString();
      
      // Start the authentication process in the background
      fetch(redirectUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }).then(async response => {
        if (response.ok) {
          console.log('Background authentication succeeded');
        } else {
          console.error('Background authentication failed:', await response.text());
        }
      }).catch(error => {
        console.error('Background authentication error:', error);
      });
      
      return res.status(200).json({
        success: false, 
        pending: true,
        message: 'Authentication request forwarded to backend',
        code_partial: code.substring(0, 8) + '...',
        timestamp: Date.now()
      });
    }
    
    // Always include the redirect parameter if provided
    const params = new URLSearchParams(req.query);
    
    // Redirect to the main backend handler
    const backendUrl = 'https://api.quits.cc/api/auth/google/callback';
    const redirectUrl = backendUrl + '?' + params.toString();
    
    console.log(`Redirecting to ${backendUrl} with ${params.toString().substring(0, 50)}...`);
    return res.redirect(307, redirectUrl);
  } catch (error) {
    console.error('Google Proxy Error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
} 