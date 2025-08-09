// Trigger the Supabase Edge Function to analyze scans that are ready
import { supabase } from './utils/supabase.js';

export default async function handler(_req, res) {
  try {
    // Find scans ready for analysis, but only for users who have enabled automatic scanning
    const { data: scans, error } = await supabase
      .from('scan_history')
      .select(`
        scan_id,
        user_id,
        users!inner(scan_frequency)
      `)
      .eq('status', 'ready_for_analysis')
      .in('users.scan_frequency', ['realtime', 'daily', 'weekly'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('TRIGGER-DEBUG: Failed to query scans:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const scanIds = (scans || []).map((s) => s.scan_id);
    if (!scanIds.length) {
      console.log('TRIGGER-DEBUG: No ready scans - may have been already processed or completed prematurely');
      return res.status(200).json({ success: true, message: 'No ready scans' });
    }

    // Call the Edge Function with the ready scan IDs
    const url = `${process.env.SUPABASE_URL}/functions/v1/gemini-scan`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ scan_ids: scanIds })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('TRIGGER-DEBUG: Edge Function failed:', resp.status, text);
      return res.status(500).json({ error: `Edge function returned ${resp.status}` });
    }

    console.log('TRIGGER-DEBUG: ✅ Edge Function succeeded on attempt 1');
    return res.status(200).json({ success: true, triggered: scanIds.length });
  } catch (e) {
    console.error('TRIGGER-DEBUG: Fatal error triggering edge function:', e);
    return res.status(500).json({ error: e.message });
  }
}