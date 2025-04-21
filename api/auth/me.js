// Auth/me endpoint to get user profile
import { handleCors, setCorsHeaders, getPath } from '../middleware.js';
import { verify } from 'jsonwebtoken';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (handleCors(req, res)) {
    return; // If it was an OPTIONS request, we're done
  }
  
  // Log basic request information for debugging
  const path = getPath(req);
  console.log(`Auth/me Handler - Processing ${req.method} request for: ${path}`);
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify the token
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET environment variable is not set');
      }
      
      const decoded = verify(token, jwtSecret);
      
      // Return user data
      return res.status(200).json({
        id: decoded.id,
        email: decoded.email,
        name: decoded.name || null,
        picture: decoded.picture || null
      });
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Auth/me error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 