-- Add scan_frequency column to users table
-- This will store the user's preferred scan frequency: 'manual', 'realtime', 'daily', 'weekly'
ALTER TABLE public.users
ADD COLUMN scan_frequency TEXT DEFAULT 'manual' CHECK (scan_frequency IN ('manual', 'realtime', 'daily', 'weekly'));

-- Add comment for documentation
COMMENT ON COLUMN public.users.scan_frequency IS 'User preference for automatic scan frequency: manual, realtime, daily, weekly';

-- Add index for efficient querying of users by scan frequency
CREATE INDEX IF NOT EXISTS idx_users_scan_frequency ON public.users(scan_frequency); 