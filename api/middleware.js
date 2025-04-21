// Global middleware for handling CORS across all API routes
export function setCorsHeaders(req, res) {
  // Set CORS headers for all response types
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token, Pragma, X-API-Key, X-Api-Version, X-Device-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

// Helper function to get the path from a request
export function getPath(req) {
  return req.url || req.path || '/'; 
}

// Middleware for handling OPTIONS preflight requests
export function handleCors(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  
  return false;
} 