// Email scan endpoint
import { handleCors, setCorsHeaders, getPath } from '../middleware.js';
import realScanHandler from '../email-scan.js';

export default async function handler(req, res) {
  // Delegate to the real scan handler
  return await realScanHandler(req, res);
} 