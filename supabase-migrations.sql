-- Supabase Migration Script
-- Create the scan_history table if it doesn't exist

CREATE TABLE IF NOT EXISTS public.scan_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    emails_found INTEGER DEFAULT 0,
    emails_to_process INTEGER DEFAULT 0,
    emails_processed INTEGER DEFAULT 0,
    emails_scanned INTEGER DEFAULT 0,
    subscriptions_found INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_scan_history_scan_id ON public.scan_history(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_user_id ON public.scan_history(user_id);

-- Add comment for documentation
COMMENT ON TABLE public.scan_history IS 'Records of email scanning operations and their status';

-- Grant access to authenticated users
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;

-- Create policies for row level security
CREATE POLICY "Users can view their own scan history"
ON public.scan_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "API can insert scan records"
ON public.scan_history
FOR INSERT
WITH CHECK (true);

CREATE POLICY "API can update scan records"
ON public.scan_history
FOR UPDATE
USING (true); 