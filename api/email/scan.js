// Email scan endpoint
import { handleCors, setCorsHeaders, getPath } from '../middleware.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (handleCors(req, res)) {
    return; // If it was an OPTIONS request, we're done
  }
  
  // Log basic request information for debugging
  const path = getPath(req);
  console.log(`Email Scan Handler - Processing ${req.method} request for: ${path}`);
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // Check for POST method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    // Extract request body
    const { limit = 100, includeRead = false } = req.body || {};
    
    // For now, return a success message to test CORS
    return res.status(202).json({
      success: true,
      message: 'Email scan initiated successfully',
      scanId: 'scan_' + Math.random().toString(36).substring(2, 15),
      estimatedTime: '30 seconds'
    });
    
  } catch (error) {
    console.error('Email scan error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 