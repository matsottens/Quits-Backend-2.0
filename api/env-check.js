import { setCorsHeaders } from './cors-middleware.js';

export default async function handler(req, res) {
  // Handle CORS
  const corsResult = setCorsHeaders(req, res);
  if (corsResult) return;

  // Report environment details
  res.status(200).json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    node_version: process.version,
    vars_configured: {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      JWT_SECRET: !!process.env.JWT_SECRET
    },
    headers: req.headers,
    path: req.url,
    origin: req.headers.origin || 'none'
  });
} 