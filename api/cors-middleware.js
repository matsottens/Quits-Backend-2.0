/**
 * Shared CORS middleware to use across API functions
 */

// Helper function to set CORS headers
function setCorsHeaders(req, res) {
  // Set CORS headers based on origin
  const origin = req.headers.origin || '';
  
  console.log('CORS middleware: Processing request with origin:', origin);
  
  // Allow specific origins
  if (origin && (origin.includes('quits.cc') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    console.log('CORS: Setting specific origin:', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
    console.log('CORS: Using wildcard origin');
  }
  
  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Gmail-Token');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours - reduces preflight requests
}

// Main CORS middleware function (default export)
export default async function corsMiddleware(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS: Handling OPTIONS preflight request');
    res.status(204).end();
    return true;
  }
  
  return false;
}

// Also export the helper function for backward compatibility
export { setCorsHeaders }; 