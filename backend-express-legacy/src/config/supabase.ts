import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { NODE_ENV, SUPABASE_URL } = process.env;

let serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
// As a last resort for read-only operations, fall back to anon key
if (!serviceKey && process.env.SUPABASE_ANON_KEY) {
  serviceKey = process.env.SUPABASE_ANON_KEY;
  console.warn('[Supabase] Falling back to anon key – read-only mode');
}

if (!SUPABASE_URL || !serviceKey) {
  const msg = 'Missing Supabase environment variables (SUPABASE_URL + service key)';
  if (NODE_ENV === 'production') {
    throw new Error(msg);
  }
  console.warn(`[Supabase] ${msg}. Supabase features disabled.`);
}

export const supabase = SUPABASE_URL && serviceKey
  ? createClient(SUPABASE_URL, serviceKey)
  : ({} as any); 