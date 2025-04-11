// Shared CORS middleware function for all API routes
export function setCorsHeaders(req, res) {
  // Log original request info for debugging
  console.log('Setting CORS headers for request:');
  console.log('  URL:', req.url);
  console.log('  Origin:', req.headers.origin);
  console.log('  Host:', req.headers.host);
  
  // Get the origin from request headers
  const origin = req.headers.origin;
  
  // Allow both www and non-www versions of quits.cc and localhost for development
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log('  Setting dynamic CORS origin:', origin);
  } else {
    // Default fallback to www version
    res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
    console.log('  Setting default CORS origin: https://www.quits.cc');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, Origin');
  
  // Add a custom header to identify that our middleware ran
  res.setHeader('X-CORS-Fixed', 'true');
  
  // For preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(200).end();
  }
  
  // For regular requests, continue processing
  return false;
} 