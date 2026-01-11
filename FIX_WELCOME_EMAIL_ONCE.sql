-- =====================================================
-- ONE-TIME FIX: Setup welcome_email_sent column properly
-- =====================================================
-- Run this ONCE and NEVER again!
-- =====================================================

-- Step 1: Add the column if it doesn't exist
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE;

-- Step 2: For THIS specific test, reset YOUR current user
-- Replace with your actual user ID
UPDATE public.user_profiles
SET welcome_email_sent = FALSE
WHERE id = 'cc52a437-6ccb-4125-ade4-68c2e9c170f3';

-- Step 3: Verify the column exists and has correct default
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'welcome_email_sent';

-- Step 4: Verify your user is ready to receive welcome email
SELECT
  up.id,
  up.full_name,
  up.welcome_email_sent,
  up.created_at,
  au.email
FROM public.user_profiles up
JOIN auth.users au ON au.id = up.id
WHERE up.id = 'cc52a437-6ccb-4125-ade4-68c2e9c170f3';

-- Expected:
-- - Column default should be 'false'
-- - Your user's welcome_email_sent should be FALSE

-- =====================================================
-- IMPORTANT: After running this:
-- 1. Sign out from your app
-- 2. Sign in again
-- 3. Welcome email should be sent!
-- 4. NEVER run the QUICK_FIX_WELCOME_EMAIL.sql again!
-- =====================================================
