// Scan Watchdog – keeps scans moving and retriggers analysis when needed
import { supabase } from './utils/supabase.js';

const MINUTES = (n) => n * 60 * 1000;

const THRESHOLDS = {
  pendingToInProgressMs: MINUTES(2),
  inProgressToAnalysisMs: MINUTES(10),
  analysisMaxMs: MINUTES(15),
};

async function triggerGemini(scanIds) {
  if (!scanIds.length) return { ok: true };
  try {
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
      const t = await resp.text();
      console.error('[WATCHDOG] Edge trigger failed', resp.status, t);
      return { ok: false, status: resp.status, error: t };
    }
    console.log('[WATCHDOG] ✅ Edge trigger success for', scanIds.length, 'scan(s)');
    return { ok: true };
  } catch (e) {
    console.error('[WATCHDOG] Edge trigger exception', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

export default async function handler(_req, res) {
  try {
    const now = Date.now();
    const activeStatuses = ['pending', 'in_progress', 'ready_for_analysis', 'analyzing'];

    const { data: scans, error } = await supabase
      .from('scan_history')
      .select('scan_id, user_id, status, created_at, updated_at, progress')
      .in('status', activeStatuses)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[WATCHDOG] Failed to list scans:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const toTrigger = new Set();
    let bumped = 0;
    let markedComplete = 0;

    for (const scan of scans || []) {
      const updatedMs = new Date(scan.updated_at || scan.created_at).getTime();
      const ageMs = now - updatedMs;

      if (scan.status === 'pending' && ageMs > THRESHOLDS.pendingToInProgressMs) {
        await supabase
          .from('scan_history')
          .update({ status: 'in_progress', progress: 10, updated_at: new Date().toISOString() })
          .eq('scan_id', scan.scan_id);
        bumped++;
        continue;
      }

      if (scan.status === 'in_progress' && ageMs > THRESHOLDS.inProgressToAnalysisMs) {
        // Promote to analysis anyway to avoid stalls
        await supabase
          .from('scan_history')
          .update({ status: 'ready_for_analysis', progress: 70, updated_at: new Date().toISOString() })
          .eq('scan_id', scan.scan_id);
        toTrigger.add(scan.scan_id);
        bumped++;
        continue;
      }

      if (scan.status === 'ready_for_analysis') {
        toTrigger.add(scan.scan_id);
        continue;
      }

      if (scan.status === 'analyzing' && ageMs > THRESHOLDS.analysisMaxMs) {
        // Check if there are any pending analysis rows left
        const { data: pending, error: pendErr } = await supabase
          .from('subscription_analysis')
          .select('id')
          .eq('scan_id', scan.scan_id)
          .eq('analysis_status', 'pending')
          .limit(1);

        if (!pendErr && pending && pending.length === 0) {
          await supabase
            .from('scan_history')
            .update({ status: 'completed', progress: 100, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('scan_id', scan.scan_id);
          markedComplete++;
        } else {
          toTrigger.add(scan.scan_id);
        }
      }
    }

    const triggerResult = await triggerGemini(Array.from(toTrigger));
    return res.status(200).json({ success: true, bumped, markedComplete, triggered: toTrigger.size, triggerOk: triggerResult.ok });
  } catch (e) {
    console.error('[WATCHDOG] Fatal error:', e);
    return res.status(500).json({ error: e.message });
  }
}


