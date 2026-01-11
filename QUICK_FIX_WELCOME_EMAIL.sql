-- =====================================================
-- QUICK FIX: Add welcome_email_sent column
-- =====================================================
-- Run this in Supabase SQL Editor RIGHT NOW
-- This will fix the duplicate welcome email issue
-- =====================================================

-- Add the column if it doesn't exist
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE;

-- For existing users created more than 1 hour ago, mark as already sent
-- (so they don't get welcome email retroactively)
-- Users created in the last hour will still get welcome email on next login
UPDATE public.user_profiles
SET welcome_email_sent = TRUE
WHERE created_at < (NOW() - INTERVAL '1 hour');

-- Verify it worked
SELECT
  id,
  full_name,
  welcome_email_sent,
  created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 10;
