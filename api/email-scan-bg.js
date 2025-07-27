export const config = { isBackground: true };

import realScanHandler from './email-scan.js';

export default async function handler(req, res) {
  try {
    await realScanHandler(req, res);
  } catch (err) {
    console.error('[email-scan-bg] worker error', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
} 