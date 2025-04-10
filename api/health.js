export default function handler(req, res) {
  // Set CORS headers
  const origin = req.headers.origin || '';
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  }
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Return health status
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    time: new Date().toISOString()
  });
} 