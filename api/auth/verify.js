// Token verification utilities
import jsonwebtoken from 'jsonwebtoken';
const { verify } = jsonwebtoken;

export async function authenticateUser(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return null;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    const decoded = verify(token, jwtSecret);
    
    // Return decoded user object
    return decoded;
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
    return null;
  }
}

export default async function handler(req, res) {
  // Set CORS headers for all response types
  const origin = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5173' 
    : 'https://www.quits.cc';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for auth/verify');
    return res.status(204).end();
  }
  
  // Add no-cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');

  try {
    // Check for GET method
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = await authenticateUser(req, res);
    if (user) {
      return res.status(200).json({
        valid: true,
        message: 'Token is valid',
        user: {
          id: user.id,
          email: user.email,
          name: user.name || null,
          picture: user.picture || null
        }
      });
    }
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(500).json({ 
      valid: false,
      error: 'server_error',
      message: 'An error occurred processing your request'
    });
  }
} 