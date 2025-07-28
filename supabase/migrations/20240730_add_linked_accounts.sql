-- Supabase migration to add linked_accounts to users table 
-- Add a new column to store an array of linked email accounts
ALTER TABLE public.users
ADD COLUMN linked_accounts TEXT[]; 