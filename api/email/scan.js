// Email scan endpoint
import { handleCors, setCorsHeaders } from '../middleware.js';

export default async function handler(req, res) {
  // Ensure CORS / preflight
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const host = req.headers.host || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (isLocal) {
    // In local dev (no Vercel background), run heavy scan directly
    const realScanHandler = (await import('../email-scan.js')).default;
    return await realScanHandler(req, res);
  }

  // Forward the request body & headers to the background function
  // Generate a client-visible scanId so the frontend can start polling immediately
  const scanId = 'scan_' + Math.random().toString(36).substring(2, 15);

  const origin = req.headers.host?.startsWith('localhost')
    ? `http://${req.headers.host}`
    : `https://${req.headers.host}`;

  // Build headers without duplicating content-type
  const fwdHeaders = { 'Content-Type': 'application/json' };
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() !== 'content-type') fwdHeaders[k] = v;
  }

  fetch(`${origin}/api/email-scan-background`, {
    method: 'POST',
    headers: fwdHeaders,
    body: JSON.stringify({ ...(req.body ?? {}), scan_id: scanId }),
  }).catch(err => console.error('bg scan invoke error', err));

  // Respond immediately – client will poll /email/status for progress
  res.status(202).json({ message: 'Scan started – processing in background', scanId });
} 