// Email scan endpoint
import { handleCors, setCorsHeaders } from '../middleware.js';

export default async function handler(req, res) {
  // Ensure CORS / preflight
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Forward the request body & headers to the background function
  const origin = req.headers.host?.startsWith('localhost')
    ? `http://${req.headers.host}`
    : `https://${req.headers.host}`;

  fetch(`${origin}/api/email-scan-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...req.headers },
    body: JSON.stringify(req.body ?? {}),
  }).catch(err => console.error('bg scan invoke error', err));

  // Respond immediately – client will poll /email/status for progress
  res.status(202).json({ message: 'Scan started – processing in background' });
} 