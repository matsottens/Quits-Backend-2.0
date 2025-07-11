import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  // Get user ID from query or auth (for demo, from query)
  const user_id = req.query.user_id;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  const { data: scan, error } = await supabase
    .from('scan_history')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!scan) return res.status(404).json({ error: 'No scan found' });
  res.status(200).json({ status: scan.status, scan_id: scan.scan_id, created_at: scan.created_at });
} 