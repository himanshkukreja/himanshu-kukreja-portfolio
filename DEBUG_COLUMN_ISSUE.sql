-- =====================================================
-- DEBUG: Why is welcome_email_sent always TRUE?
-- =====================================================
-- Run these queries to investigate
-- =====================================================

-- 1. Check the column definition and default value
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'welcome_email_sent';
-- Expected: column_default should be 'false'
-- If it's 'true' or NULL, that's the problem!


-- 2. Check all triggers on user_profiles table
SELECT
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'user_profiles'
ORDER BY trigger_name;
-- Look for any trigger that might be setting welcome_email_sent to TRUE


-- 3. Check the create_user_profile function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_user_profile';
-- This will show the exact SQL of the trigger function


-- 4. Check if there's a default constraint
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
AND conname LIKE '%welcome%';
-- Look for any constraint on welcome_email_sent


-- 5. Test: Create a dummy user profile manually
-- DO NOT RUN THIS - Just for reference
-- INSERT INTO public.user_profiles (id, full_name)
-- VALUES (gen_random_uuid(), 'Test User');
-- Then check: SELECT welcome_email_sent FROM user_profiles WHERE full_name = 'Test User';
-- This will tell us if the column default works correctly


-- =====================================================
-- LIKELY CULPRIT:
-- =====================================================
-- If column_default is NOT 'false', run this to fix it:

-- ALTER TABLE public.user_profiles
-- ALTER COLUMN welcome_email_sent SET DEFAULT FALSE;

-- Then verify:
-- SELECT column_default FROM information_schema.columns
-- WHERE table_name = 'user_profiles' AND column_name = 'welcome_email_sent';
