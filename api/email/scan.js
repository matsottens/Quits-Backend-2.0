// Email scan endpoint
import { handleCors, setCorsHeaders } from '../middleware.js';
import { createClient } from '@supabase/supabase-js';
import jsonwebtoken from 'jsonwebtoken';
import { randomUUID } from 'crypto';

// --- Supabase Client Initialization ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

  try {
    // --- 1. Authenticate the User ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization token' });
    }
    const token = authHeader.substring(7);
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // --- 2. Create the Scan Record (Synchronously) ---
    const id = randomUUID();
    const scanId = 'scan_' + Math.random().toString(36).substring(2, 15);
    const { data, error } = await supabase
      .from('scan_history')
      .insert({
        id: id,
        scan_id: scanId,
        user_id: userId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating initial scan record:', error);
      return res.status(500).json({ error: 'Failed to create scan record', details: error.message });
    }

    // --- 3. Trigger the Background Job (Asynchronously) ---
    const origin = req.headers.host?.startsWith('localhost') ? `http://${req.headers.host}` : `https://${req.headers.host}`;
    const fwdHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    fetch(`${origin}/api/email-scan-background`, {
      method: 'POST',
      headers: fwdHeaders,
      body: JSON.stringify({ scan_id: scanId }), // Pass only the essential ID
    }).catch(err => console.error('bg scan invoke error', err));

    // --- 4. Respond to the Client Immediately ---
    res.status(202).json({ message: 'Scan started – processing in background', scanId });

  } catch (error) {
    console.error('Error in /api/email/scan handler:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
} 