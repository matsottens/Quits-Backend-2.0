import url from 'url';

export default function handler(req, res) {
  // Legacy Google OAuth callback – no longer used. All clients should call /api/google-proxy.
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('[auth-callback] Deprecated endpoint hit – returning 410');
  return res.status(410).json({
    success: false,
    error: 'deprecated_endpoint',
    message: 'This endpoint is deprecated. Use /api/google-proxy instead.'
  });
} 