import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  console.log('SCAN-STATUS-DEBUG: Handler called');
  console.log('SCAN-STATUS-DEBUG: Method:', req.method);
  console.log('SCAN-STATUS-DEBUG: URL:', req.url);

  if (req.method === 'OPTIONS') {
    console.log('SCAN-STATUS-DEBUG: Handling OPTIONS request');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseKey = supabaseServiceRoleKey || supabaseServiceKey;
  
  const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);
  
  // Debug Supabase connection
  console.log('SCAN-STATUS-DEBUG: SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set');
  console.log('SCAN-STATUS-DEBUG: SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');
  console.log('SCAN-STATUS-DEBUG: SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Set' : 'Not set');
  console.log('SCAN-STATUS-DEBUG: Final supabaseKey:', supabaseKey ? 'Set' : 'Not set');
  
  try {
    // Extract and verify authorization token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'dev_secret_DO_NOT_USE_IN_PRODUCTION';
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.id || decoded.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid user ID in token' });
    }

    // Get scanId from path or query parameters
    const pathParts = req.url.split('/');
    const scanIdFromPath = pathParts[pathParts.length - 1];
    const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
    const scanId = scanIdFromPath !== 'scan-status' ? scanIdFromPath : (queryParams.get('scanId') || 'latest');

    console.log('SCAN-STATUS-DEBUG: URL:', req.url);
    console.log('SCAN-STATUS-DEBUG: Path parts:', pathParts);
    console.log('SCAN-STATUS-DEBUG: Scan ID from path:', scanIdFromPath);
    console.log('SCAN-STATUS-DEBUG: Final scan ID:', scanId);

    let scan;
    let error;

    if (scanId && scanId !== 'latest') {
      // Query by specific scan ID
      const { data, error: scanError } = await supabase
        .from('scan_history')
        .select('*')
        .eq('scan_id', scanId)
        .eq('user_id', userId)
        .single();
      
      scan = data;
      error = scanError;
    } else {
      // Query latest scan for user
      const { data, error: scanError } = await supabase
        .from('scan_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      scan = data;
      error = scanError;
    }

    if (error) {
      console.error('Error fetching scan:', error);
      return res.status(500).json({ error: error.message });
    }
    
    if (!scan) {
      return res.status(404).json({ error: 'No scan found' });
    }

    // Calculate progress based on status
    let progress = 0;
    if (scan.status === 'in_progress') {
      progress = Math.min(50, scan.progress || 0); // Reading phase: 0-50%
    } else if (scan.status === 'ready_for_analysis' || scan.status === 'analyzing') {
      progress = 50 + (scan.progress || 0) / 2; // Analysis phase: 50-100%
    } else if (scan.status === 'completed') {
      progress = 100;
    }

    // Get stats for the scan
    const stats = {
      emails_found: scan.emails_found || 0,
      emails_to_process: scan.emails_to_process || 0,
      emails_processed: scan.emails_processed || 0,
      subscriptions_found: scan.subscriptions_found || 0
    };

    res.status(200).json({ 
      status: scan.status, 
      scan_id: scan.scan_id, 
      created_at: scan.created_at,
      progress: progress,
      stats: stats
    });
  } catch (error) {
    console.error('Unexpected error in scan-status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 