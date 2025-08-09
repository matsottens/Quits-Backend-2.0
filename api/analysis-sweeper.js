// Analysis Sweeper – promotes completed analysis to subscriptions and dedupes
import { supabase } from './utils/supabase.js';

const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

export default async function handler(_req, res) {
  try {
    // Find recent scans that are completed or finished analyzing
    const { data: scans, error: scansErr } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, status')
      .in('status', ['ready_for_analysis', 'analyzing', 'completed'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (scansErr) {
      console.error('[SWEEPER] Failed to read scans:', scansErr.message);
      return res.status(500).json({ error: scansErr.message });
    }

    let promoted = 0;
    for (const scan of scans || []) {
      // Read analysis rows that are completed
      const { data: rows, error: rowsErr } = await supabase
        .from('subscription_analysis')
        .select('id, user_id, scan_id, subscription_name, price, currency, billing_cycle, analysis_status')
        .eq('scan_id', scan.scan_id)
        .eq('analysis_status', 'completed');
      if (rowsErr) continue;

      for (const r of rows || []) {
        const name = r.subscription_name;
        if (!name) continue;
        const norm = normalize(name);

        // Check for duplicates in subscriptions by normalized name
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', r.user_id)
          .ilike('name', `%${norm}%`)
          .limit(1);

        if (existing && existing.length) continue;

        const { error: insErr } = await supabase
          .from('subscriptions')
          .insert({
            user_id: r.user_id,
            name: name,
            price: Number(r.price || 0),
            currency: r.currency || 'USD',
            billing_cycle: r.billing_cycle || 'monthly',
            category: 'auto-detected',
            is_manual: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        if (!insErr) promoted++;
      }
    }

    return res.status(200).json({ success: true, promoted });
  } catch (e) {
    console.error('[SWEEPER] Fatal error:', e);
    return res.status(500).json({ error: e.message });
  }
}


