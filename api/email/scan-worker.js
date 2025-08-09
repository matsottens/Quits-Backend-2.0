// Email scan worker – executes the heavy Gmail fetch + analysis queueing
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function updateScan(scanId, userId, updates) {
  await supabase.from('scan_history').update({ ...updates, updated_at: new Date().toISOString() }).eq('scan_id', scanId).eq('user_id', userId);
}

async function validateToken(token) {
  try {
    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function listMessageIds(token) {
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:(subscription OR receipt OR invoice OR billing OR payment OR renewal)&maxResults=50';
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return [];
  const json = await resp.json();
  return (json.messages || []).map(m => m.id);
}

async function getMessage(token, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  return await resp.json();
}

function header(headers, name) {
  return (headers || []).find(h => h.name === name)?.value || '';
}

export default async function handler(req, res) {
  try {
    const scanId = req.query.scanId || req.body.scanId;
    if (!scanId) return res.status(400).json({ error: 'scanId required' });

    const { data: scan, error: scanErr } = await supabase.from('scan_history').select('*').eq('scan_id', scanId).single();
    if (scanErr || !scan) return res.status(404).json({ error: 'scan not found' });

    const userId = scan.user_id;
    // Get gmail token from users table
    const { data: userRow } = await supabase.from('users').select('gmail_access_token').eq('id', userId).single();
    const gmailToken = userRow?.gmail_access_token;

    await updateScan(scanId, userId, { status: 'in_progress', progress: 15 });

    // Validate token (warn-only) and list messages
    const tokenOk = gmailToken ? await validateToken(gmailToken) : false;
    if (!tokenOk) {
      await updateScan(scanId, userId, { status: 'ready_for_analysis', progress: 70, error_message: 'Gmail token invalid in worker' });
      return res.status(200).json({ success: true, scanId, degraded: true });
    }

    const ids = await listMessageIds(gmailToken);
    await updateScan(scanId, userId, { progress: 20, emails_found: ids.length, emails_to_process: ids.length });

    let processed = 0;
    for (const id of ids) {
      const msg = await getMessage(gmailToken, id);
      if (!msg) continue;
      const headers = msg.payload?.headers || [];
      const record = {
        scan_id: scanId,
        user_id: userId,
        gmail_message_id: id,
        subject: header(headers, 'Subject') || 'No Subject',
        sender: header(headers, 'From') || 'Unknown Sender',
        date: header(headers, 'Date') || new Date().toISOString(),
        content: '',
        content_preview: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      // Insert email_data and capture the inserted row (need its id)
      const emailInsertResp = await fetch(`${supabaseUrl}/rest/v1/email_data`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceRoleKey,
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(record)
      });

      let emailRowId = null;
      if (emailInsertResp.ok) {
        try {
          const inserted = await emailInsertResp.json();
          const emailRow = Array.isArray(inserted) ? inserted[0] : inserted;
          emailRowId = emailRow?.id || null;
        } catch {}
      }

      // Create a pending analysis row for this email so the edge function can process it
      if (emailRowId) {
        await fetch(`${supabaseUrl}/rest/v1/subscription_analysis`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceRoleKey,
            'Authorization': `Bearer ${supabaseServiceRoleKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email_data_id: emailRowId,
            user_id: userId,
            scan_id: scanId,
            analysis_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
      }
      processed++;
      if (processed % 5 === 0) await updateScan(scanId, userId, { progress: 30 + Math.round((processed / Math.max(ids.length, 1)) * 40), emails_processed: processed });
    }

    // Create placeholder analysis rows (pending) from email_data for this scan
    // The Supabase edge function will enrich and promote them.
    await updateScan(scanId, userId, { status: 'ready_for_analysis', progress: 70, emails_processed: processed });

    // Trigger edge function
    try {
      const url = `${process.env.SUPABASE_URL}/functions/v1/gemini-scan`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ scan_ids: [scanId] })
      });
    } catch {}

    return res.status(200).json({ success: true, scanId, processed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}


