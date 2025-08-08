-- Add status tracking to subscriptions for cancellation detection
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.subscriptions.status IS 'active|canceled|paused|trial';

