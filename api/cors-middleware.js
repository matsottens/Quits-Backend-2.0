/**
 * Shared CORS middleware to use across API functions
 */
export function setCorsHeaders(req, res) {
  // Set CORS headers based on origin
  const origin = req.headers.origin || '';
  
  // Allow specific origins
  if (origin.includes('quits.cc') || origin.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
  
  // Handle OPTIONS method
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  
  return false;
} 