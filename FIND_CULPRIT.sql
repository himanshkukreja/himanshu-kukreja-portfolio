-- =====================================================
-- FIND THE CULPRIT: What's setting welcome_email_sent to TRUE?
-- =====================================================

-- 1. Check for OTHER triggers on user_profiles that might UPDATE the value
SELECT
  trigger_name,
  event_manipulation AS event_type,
  action_timing AS when_fired,
  action_statement AS what_it_does
FROM information_schema.triggers
WHERE event_object_table = 'user_profiles'
AND event_object_schema = 'public'
ORDER BY event_manipulation, action_timing;

-- Expected: Should be EMPTY (no triggers on user_profiles)
-- If you see ANY triggers here, that's the culprit!


-- 2. Check for triggers that fire AFTER the insert
SELECT
  t.tgname AS trigger_name,
  p.proname AS function_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'public.user_profiles'::regclass
ORDER BY t.tgname;

-- This shows ALL triggers and what functions they call


-- 3. Test: Insert a dummy row and see what happens
-- First, create a test auth user (we'll delete it right after)
-- Note: This won't work because of foreign key, but shows the concept
-- INSERT INTO public.user_profiles (id, full_name, welcome_email_sent)
-- VALUES ('test-id', 'Test User', FALSE);


-- 4. Check if there's a Row Level Security policy that modifies values
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_profiles';

-- RLS policies can modify data on insert!


-- 5. Check for any CHECK constraints that might affect the value
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
AND contype = 'c'  -- CHECK constraints
ORDER BY conname;


-- =====================================================
-- RESULTS TO ANALYZE:
-- =====================================================
-- Query 1: Should be EMPTY - no triggers on user_profiles
-- Query 2: Should show no triggers on user_profiles
-- Query 3: N/A (can't actually run)
-- Query 4: Check if any RLS policy has WITH CHECK that sets welcome_email_sent
-- Query 5: Should be empty - no CHECK constraints affecting welcome_email_sent
-- =====================================================
