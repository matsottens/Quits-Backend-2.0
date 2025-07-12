import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  // Get user ID from query or auth (for demo, from query)
  const user_id = req.query.user_id;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  try {
    const { data: scan, error } = await supabase
      .from('scan_history')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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
      subscriptions_found: scan.subscriptions_found || 0,
      potential_subscriptions: scan.potential_subscriptions || 0
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