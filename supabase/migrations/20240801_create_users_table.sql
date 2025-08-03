CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  profile_picture TEXT,
  google_id TEXT UNIQUE,
  gmail_refresh_token TEXT,
  gmail_access_token TEXT,
  gmail_token_expires_at TIMESTAMPTZ,
  linked_accounts TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index to speed up lookups by email
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Enable RLS so that later policies can be added (disabled by default)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY; 