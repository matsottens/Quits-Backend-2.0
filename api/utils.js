// Shared utility functions

/**
 * Set CORS headers for all responses
 */
export function setCorsHeaders(req, res) {
  // Always ensure proper CORS headers are set, especially for Cache-Control
  const origin = req.headers.origin || '';
  
  // Allow specific origins with credentials
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // For requests without an origin header, use a wildcard (no credentials allowed with wildcard)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Explicitly include Cache-Control in allowed headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Add Cache-Control header to prevent caching of API responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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