import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;

// Prefer the new name but fall back to legacy SUPABASE_SERVICE_KEY so existing
// local env files continue to work without changes.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[supabase] Environment at start:', {
    SUPABASE_URL: !!supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
  });
  throw new Error('Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or legacy SUPABASE_SERVICE_KEY) are set in .env.local or .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey); 