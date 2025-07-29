import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { supabase } from './utils/supabase.js';

// helper to merge linked accounts array on the users row
async function mergeLinkedAccount(userId, email) {
  try {
    const { data: userRow, error: fetchErr } = await supabase
      .from('users')
      .select('linked_accounts')
      .eq('id', userId)
      .single();

    if (fetchErr) throw fetchErr;

    const current = userRow?.linked_accounts || [];
    if (!current.includes(email)) {
      const updated = [...current, email];
      await supabase.from('users').update({ linked_accounts: updated }).eq('id', userId);
    }
  } catch (e) {
    console.error('[google-proxy] Failed to merge linked account', e);
  }
}

async function exchangeCodeForToken(code, redirect_uri) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri
  );
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return { oauth2Client, tokens };
}

async function getUserInfo(oauth2Client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data;
}

// Helper to ensure new user table columns exist (runs once per instance)
let schemaEnsured = false;

async function ensureUserTableSchema() {
  if (schemaEnsured) return;

  const sql = `\nALTER TABLE public.users\n  ADD COLUMN IF NOT EXISTS linked_accounts TEXT[],\n  ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,\n  ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,\n  ADD COLUMN IF NOT EXISTS gmail_access_token TEXT,\n  ADD COLUMN IF NOT EXISTS gmail_token_expires_at TIMESTAMP WITH TIME ZONE;\n`;

  try {
    // Vercel environments run on Node 18+ so fetch is available globally
    const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn('[google-proxy] Schema ensure RPC responded with', resp.status, text);
    } else {
      console.log('[google-proxy] User table schema ensured');
      schemaEnsured = true;
    }
  } catch (err) {
    console.error('[google-proxy] Failed to ensure user table schema', err);
  }
}

export default async function handler(req, res) {
  // Always set CORS headers so browser accepts JSON responses
  res.setHeader('Access-Control-Allow-Origin', 'https://www.quits.cc');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Cache-Control, X-Requested-With');

  const { code, state, redirect_uri = 'https://www.quits.cc/auth/callback' } = req.query;

  if (!code) {
    return res.status(400).json({ success: false, error: 'missing_code' });
  }

  try {
    // Before doing anything that touches the users table, make sure the schema is up to date
    await ensureUserTableSchema();

    const { oauth2Client, tokens } = await exchangeCodeForToken(code, redirect_uri);
    const userInfo = await getUserInfo(oauth2Client);

    let internalUserId = null;

    // 1. If state param has uid: use that (settings flow)
    if (typeof state === 'string' && state.startsWith('uid:')) {
      const possible = state.substring(4);
      if (/^[0-9a-fA-F-]{36}$/.test(possible)) internalUserId = possible;
    }

    // 2. Otherwise look up by primary email
    if (!internalUserId) {
      const { data: existing, error: lookupErr } = await supabase
        .from('users')
        .select('id')
        .eq('email', userInfo.email)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (existing) internalUserId = existing.id;
    }

    // 3. Still null? create new user row (pure Google sign-up)
    if (!internalUserId) {
      const { data: inserted, error: insErr } = await supabase
        .from('users')
        .insert({
          email: userInfo.email,
          name: userInfo.name || userInfo.email.split('@')[0],
          avatar_url: userInfo.picture || null,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      internalUserId = inserted.id;
    }

    // Merge linked account + update Google tokens
    await mergeLinkedAccount(internalUserId, userInfo.email);

    await supabase
      .from('users')
      .update({
        google_id: userInfo.id,
        gmail_refresh_token: tokens.refresh_token,
        gmail_access_token: tokens.access_token,
        gmail_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        avatar_url: userInfo.picture || null
      })
      .eq('id', internalUserId);

    const token = jwt.sign(
      {
        id: internalUserId,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        gmail_token: tokens.access_token,
        // Add any other relevant claims
      },
      process.env.JWT_SECRET,
                { expiresIn: '7d' }
              );
              
    return res.status(200).json({ success: true, token, user: { ...userInfo, id: internalUserId } });
  } catch (error) {
    console.error('Error in google-proxy:', error.message);
    return res.status(500).json({ success: false, error: 'auth_failed', message: error.message });
  }
} 