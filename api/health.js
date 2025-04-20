// Enterprise-grade health check endpoint
export default function handler(req, res) {
  // Set comprehensive CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, X-Api-Version');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Prevent caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  // For HEAD requests, return success without body
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  
  // Get client info for diagnostics
  const clientIp = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   'unknown';
  
  const origin = req.headers.origin || 'unknown';
  const referer = req.headers.referer || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Log the request with detailed client info
  console.log(`Health check from ${origin} (IP: ${clientIp}) at ${new Date().toISOString()}`);
  console.log(`Referer: ${referer} | User-Agent: ${userAgent.substring(0, 100)}`);
  
  // Get deployment info
  const environment = process.env.NODE_ENV || 'unknown';
  const vercelEnv = process.env.VERCEL_ENV || 'unknown';
  const region = process.env.VERCEL_REGION || 'unknown';
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown';
  
  // Generate response with full diagnostics
  const response = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    request_id: Math.random().toString(36).substring(2, 15),
    environment,
    deployment: {
      environment: vercelEnv,
      region,
      version
    },
    client: {
      origin,
      referer: referer === 'unknown' ? undefined : referer,
      user_agent: userAgent === 'unknown' ? undefined : userAgent.substring(0, 100),
      ip: clientIp === 'unknown' ? undefined : clientIp
    },
    cors_enabled: true,
    cache_control: 'no-cache',
    protocol: req.headers['x-forwarded-proto'] || 'http',
    api_url: req.headers.host || 'unknown',
    message: 'API is healthy and running'
  };
  
  // Return comprehensive health information
  return res.status(200).json(response);
} 