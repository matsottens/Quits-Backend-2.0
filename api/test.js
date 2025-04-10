import { setCorsHeaders } from './cors-middleware.js';

export default function handler(req, res) {
  // Handle CORS with shared middleware
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return corsResult; // Return early if it was an OPTIONS request
  
  // Return test data
  res.status(200).json({
    status: 'ok',
    message: 'API is working',
    timestamp: new Date().toISOString(),
    request: {
      origin: req.headers.origin || 'none',
      host: req.headers.host,
      userAgent: req.headers['user-agent']
    },
    cors: {
      usingSharedMiddleware: true,
      corsHeadersSet: res.getHeader('X-CORS-Fixed') === 'true'
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      vercel: true,
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasJwtSecret: !!process.env.JWT_SECRET
    }
  });
} 