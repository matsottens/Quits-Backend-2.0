// Email scan worker – executes the heavy Gmail fetch + analysis queueing
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { workerLogger, ScanError, ErrorCodes, withErrorHandling, gmailRateLimiter } from '../utils/logger.js';

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

function extractEmailContent(message) {
  // Extract email body content from Gmail API message structure
  function extractFromPart(part) {
    if (!part) return '';
    
    // If this part has body data, extract it
    if (part.body && part.body.data) {
      try {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      } catch (e) {
        return '';
      }
    }
    
    // If this part has sub-parts, recursively extract
    if (part.parts && Array.isArray(part.parts)) {
      return part.parts.map(subPart => extractFromPart(subPart)).join('\n').trim();
    }
    
    return '';
  }
  
  if (!message || !message.payload) return '';
  
  // Try to extract content from the payload
  const content = extractFromPart(message.payload);
  
  // If no content found, try to get snippet as fallback
  if (!content && message.snippet) {
    return message.snippet;
  }
  
  return content || '';
}

const scanWorkerHandler = withErrorHandling(async (req, res) => {
  const scanId = req.query.scanId || req.body.scanId;
  if (!scanId) {
    throw new ScanError('Scan ID is required', ErrorCodes.SCAN_NOT_FOUND);
  }

  workerLogger.info('Worker started', { scanId });

  const { data: scan, error: scanErr } = await supabase.from('scan_history').select('*').eq('scan_id', scanId).single();
  if (scanErr || !scan) {
    throw new ScanError('Scan not found', ErrorCodes.SCAN_NOT_FOUND, { scanId, dbError: scanErr });
  }

  const userId = scan.user_id;
  workerLogger.info('Processing scan', { scanId, userId, status: scan.status });

  // Get gmail token from users table
  const { data: userRow, error: userErr } = await supabase.from('users').select('gmail_access_token').eq('id', userId).single();
  if (userErr) {
    throw new ScanError('User not found', ErrorCodes.DB_QUERY_ERROR, { userId, dbError: userErr });
  }

  const gmailToken = userRow?.gmail_access_token;

  await updateScan(scanId, userId, { status: 'in_progress', progress: 15 });
  workerLogger.scanProgress(scanId, 15, 'in_progress');

  // Validate token and list messages
  const tokenOk = gmailToken ? await validateToken(gmailToken) : false;
  if (!tokenOk) {
    workerLogger.warn('Gmail token invalid', { scanId, userId });
    await updateScan(scanId, userId, { status: 'ready_for_analysis', progress: 70, error_message: 'Gmail token invalid in worker' });
    workerLogger.scanProgress(scanId, 70, 'ready_for_analysis', { degraded: true });
    return res.status(200).json({ success: true, scanId, degraded: true });
  }

  const ids = await listMessageIds(gmailToken);
  workerLogger.info('Gmail messages found', { scanId, emailCount: ids.length });
  await updateScan(scanId, userId, { progress: 20, emails_found: ids.length, emails_to_process: ids.length });
  workerLogger.scanProgress(scanId, 20, 'in_progress', { emailsFound: ids.length });

    let processed = 0;
    for (const id of ids) {
      const msg = await getMessage(gmailToken, id);
      if (!msg) continue;
      const headers = msg.payload?.headers || [];
      
      // Extract email content
      const content = extractEmailContent(msg);
      const preview = content.substring(0, 500); // First 500 chars as preview
      
      const record = {
        scan_id: scanId,
        user_id: userId,
        gmail_message_id: id,
        subject: header(headers, 'Subject') || 'No Subject',
        sender: header(headers, 'From') || 'Unknown Sender',
        date: header(headers, 'Date') || new Date().toISOString(),
        content: content,
        content_preview: preview,
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
      
      // Update progress more frequently for better UX - every 2 emails or every 5 seconds
      const shouldUpdate = (processed % 2 === 0) || (processed === ids.length);
      if (shouldUpdate) {
        // Progress from 20% to 70% during email processing
        const emailProgress = Math.round((processed / Math.max(ids.length, 1)) * 50);
        const currentProgress = 20 + emailProgress;
        await updateScan(scanId, userId, { 
          progress: Math.min(currentProgress, 70), 
          emails_processed: processed,
          status: 'in_progress'
        });
      }
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

  const duration = Date.now() - new Date(scan.created_at).getTime();
  workerLogger.scanComplete(scanId, duration, { emailsProcessed: processed });
  return res.status(200).json({ success: true, scanId, processed });
}, workerLogger);

export default async function handler(req, res) {
  try {
    return await scanWorkerHandler(req, res);
  } catch (error) {
    if (error instanceof ScanError) {
      workerLogger.error(error.message, error.details);
      return res.status(400).json({ 
        error: error.code, 
        message: error.message,
        details: error.details 
      });
    } else {
      workerLogger.error('Unexpected error', { error: error.message, stack: error.stack });
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}


