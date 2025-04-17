/**
 * Shared CORS middleware to use across API functions
 */
export function setCorsHeaders(req, res) {
  // Set CORS headers based on origin
  const origin = req.headers.origin || '';
  
  console.log('CORS middleware: Processing request with origin:', origin);
  console.log('Request headers:', req.headers);
  
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
  
  console.log('CORS headers set:', {
    'Access-Control-Allow-Origin': res.getHeader('Access-Control-Allow-Origin'),
    'Access-Control-Allow-Headers': res.getHeader('Access-Control-Allow-Headers'),
    'Access-Control-Allow-Methods': res.getHeader('Access-Control-Allow-Methods')
  });
  
  // Handle OPTIONS method
  if (req.method === 'OPTIONS') {
    console.log('CORS: Handling OPTIONS preflight request');
    res.status(204).end();
    return true;
  }
  
  return false;
} 