// Simple root handler without any complex routing
export default function handler(req, res) {
  // Set basic CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // Simple response for root path
  return res.status(200).json({
    message: 'Quits API server is running',
    status: 'ok',
    time: new Date().toISOString(),
    documentation: 'Visit https://www.quits.cc for more information'
  });
} 