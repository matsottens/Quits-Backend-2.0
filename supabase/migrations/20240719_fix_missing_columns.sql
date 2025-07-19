-- Fix missing columns in database schema
-- Add missing columns that the backend code expects

-- Add profile_picture column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS profile_picture TEXT;

-- Add started_at column to scan_history table
ALTER TABLE public.scan_history 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;

-- Add use_real_data column to scan_history table
ALTER TABLE public.scan_history 
ADD COLUMN IF NOT EXISTS use_real_data BOOLEAN DEFAULT true;

-- Update existing scan_history records to have started_at = created_at
UPDATE public.scan_history 
SET started_at = created_at 
WHERE started_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.users.profile_picture IS 'User profile picture URL from Google OAuth';
COMMENT ON COLUMN public.scan_history.started_at IS 'When the scan actually started processing';
COMMENT ON COLUMN public.scan_history.use_real_data IS 'Whether the scan used real Gmail data or mock data'; 