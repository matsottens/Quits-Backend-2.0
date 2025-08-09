-- SAFE RLS Policy Diagnostic and Fix Script
-- This script will first check what exists, then make minimal safe changes

-- STEP 1: Check current policies before making any changes
SELECT 'BEFORE: Current policies on scan_history:' as info;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'scan_history'
ORDER BY policyname;

SELECT 'BEFORE: Current policies on email_data:' as info;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'email_data'
ORDER BY policyname;

SELECT 'BEFORE: Current policies on subscription_analysis:' as info;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'subscription_analysis'
ORDER BY policyname;

-- STEP 2: Only add missing service role policies (without dropping existing ones)
-- These are safe additions that won't break existing functionality

-- Service role policies for scan_history
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'scan_history' 
        AND policyname = 'Service role can insert scan records'
    ) THEN
        CREATE POLICY "Service role can insert scan records"
        ON public.scan_history
        FOR INSERT
        TO service_role
        WITH CHECK (true);
        RAISE NOTICE 'Created policy: Service role can insert scan records';
    ELSE
        RAISE NOTICE 'Policy already exists: Service role can insert scan records';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'scan_history' 
        AND policyname = 'Service role can update scan records'
    ) THEN
        CREATE POLICY "Service role can update scan records"
        ON public.scan_history
        FOR UPDATE
        TO service_role
        USING (true);
        RAISE NOTICE 'Created policy: Service role can update scan records';
    ELSE
        RAISE NOTICE 'Policy already exists: Service role can update scan records';
    END IF;
END
$$;

-- Service role policies for email_data
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_data' 
        AND policyname = 'Service role can insert email data'
    ) THEN
        CREATE POLICY "Service role can insert email data"
        ON public.email_data
        FOR INSERT
        TO service_role
        WITH CHECK (true);
        RAISE NOTICE 'Created policy: Service role can insert email data';
    ELSE
        RAISE NOTICE 'Policy already exists: Service role can insert email data';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_data' 
        AND policyname = 'Service role can update email data'
    ) THEN
        CREATE POLICY "Service role can update email data"
        ON public.email_data
        FOR UPDATE
        TO service_role
        USING (true);
        RAISE NOTICE 'Created policy: Service role can update email data';
    ELSE
        RAISE NOTICE 'Policy already exists: Service role can update email data';
    END IF;
END
$$;

-- Service role policies for subscription_analysis
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'subscription_analysis' 
        AND policyname = 'Service role can insert subscription analysis'
    ) THEN
        CREATE POLICY "Service role can insert subscription analysis"
        ON public.subscription_analysis
        FOR INSERT
        TO service_role
        WITH CHECK (true);
        RAISE NOTICE 'Created policy: Service role can insert subscription analysis';
    ELSE
        RAISE NOTICE 'Policy already exists: Service role can insert subscription analysis';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'subscription_analysis' 
        AND policyname = 'Service role can update subscription analysis'
    ) THEN
        CREATE POLICY "Service role can update subscription analysis"
        ON public.subscription_analysis
        FOR UPDATE
        TO service_role
        USING (true);
        RAISE NOTICE 'Created policy: Service role can update subscription analysis';
    ELSE
        RAISE NOTICE 'Policy already exists: Service role can update subscription analysis';
    END IF;
END
$$;

-- STEP 3: Verify all policies after changes
SELECT 'AFTER: Final policies on scan_history:' as info;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'scan_history'
ORDER BY policyname;

SELECT 'AFTER: Final policies on email_data:' as info;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'email_data'
ORDER BY policyname;

SELECT 'AFTER: Final policies on subscription_analysis:' as info;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'subscription_analysis'
ORDER BY policyname;
