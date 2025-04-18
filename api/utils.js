// Shared utility functions

/**
 * Set CORS headers for all responses
 */
export function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token');
}

/**
 * Generate a JWT token
 */
export async function generateToken(payload) {
  const { default: jwt } = await import('jsonwebtoken');
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your-jwt-secret-key',
    { expiresIn: '7d' }
  );
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return false;
}

/**
 * Extract path from URL
 */
export function getPath(req) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    return url.pathname;
  } catch (error) {
    // Fallback for older Node versions or invalid URLs
    let path = req.url || '';
    const queryIndex = path.indexOf('?');
    if (queryIndex !== -1) {
      path = path.substring(0, queryIndex);
    }
    // Remove trailing slashes
    while (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }
} 