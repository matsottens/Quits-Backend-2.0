// Catch-all handler for auth endpoints
import jsonwebtoken from 'jsonwebtoken';
const { verify } = jsonwebtoken;

export default async function handler(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log(`Handling OPTIONS preflight request for ${req.url}`);
    return res.status(204).end();
  }

  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  // Extract path parts
  const path = req.url.split('?')[0];
  console.log(`Auth catch-all handler processing: ${req.url}`);

  try {
    if (path.includes('/auth/me') || path === '/me') {
      // Auth/me endpoint
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed for auth/me' });
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
        const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
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
    } else if (path.includes('/auth/verify') || path === '/verify') {
      // Auth verification endpoint
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed for auth/verify' });
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
        const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
        const decoded = verify(token, jwtSecret);
        
        // Return success
        return res.status(200).json({
          valid: true,
          message: 'Token is valid',
          user: {
            id: decoded.id,
            email: decoded.email
          }
        });
      } catch (tokenError) {
        console.error('Token verification error:', tokenError);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } else {
      // Default response for unrecognized auth paths
      return res.status(404).json({
        error: 'not_found',
        message: `Auth endpoint not found: ${path}`
      });
    }
  } catch (error) {
    console.error(`Auth handler error for ${req.url}:`, error);
    return res.status(500).json({
      error: 'server_error',
      message: 'An unexpected error occurred'
    });
  }
} 