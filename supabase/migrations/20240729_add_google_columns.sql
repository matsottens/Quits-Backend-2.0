-- Add Google OAuth related columns
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_access_token TEXT,
ADD COLUMN IF NOT EXISTS gmail_token_expires_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.users.google_id IS 'Google account ID (sub) linked to the user';
COMMENT ON COLUMN public.users.gmail_refresh_token IS 'Gmail OAuth refresh token';
COMMENT ON COLUMN public.users.gmail_access_token IS 'Last issued Gmail access token (optional cache)';
COMMENT ON COLUMN public.users.gmail_token_expires_at IS 'When the current Gmail access token expires'; 