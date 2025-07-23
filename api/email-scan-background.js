// Runs heavy Gmail fetch & pattern-matching in the background so the main
// /api/email/scan endpoint can respond instantly.
// Vercel treats any file exporting config.isBackground = true as a background
// function (up to 15 min execution).

export const config = { isBackground: true };

import realScanHandler from './email-scan.js';

export default async function handler(req, res) {
  try {
    await realScanHandler(req, res);
  } catch (err) {
    console.error('[email-scan-background] worker error', err);
    // Background function still needs to return a response object even though
    // the caller doesn’t wait for it.
    res.status(500).json({ error: (err instanceof Error ? err.message : String(err)) });
  }
} 