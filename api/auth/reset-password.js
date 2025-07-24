import fetch from 'node-fetch';

export default async function handler(req, res) {
  const backendUrl = process.env.BACKEND_URL || 'https://api-quits-2-0.vercel.app';
  const target = `${backendUrl}/api/auth/reset-password`;

  const options = {
    method: req.method,
    headers: { ...req.headers, host: undefined },
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body)
  };

  try {
    const r = await fetch(target, options);
    const data = await r.text();
    res.status(r.status);
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.send(data);
  } catch (e) {
    res.status(500).json({ error: 'proxy_failed', message: e.message });
  }
} 