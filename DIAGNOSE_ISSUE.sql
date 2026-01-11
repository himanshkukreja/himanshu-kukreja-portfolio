-- =====================================================
-- DIAGNOSE: Find out WHY welcome_email_sent is always TRUE
-- =====================================================
-- Run this in Supabase SQL Editor to diagnose the issue
-- =====================================================

-- 1. Check the column default value
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'welcome_email_sent';
-- CRITICAL: Check if column_default is 'false' or 'true'


-- 2. Check ALL triggers on user_profiles table
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'user_profiles'
ORDER BY trigger_name;
-- Look for any trigger that might UPDATE welcome_email_sent


-- 3. Check ALL triggers on auth.users table (this is where the profile is created)
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND event_object_schema = 'auth'
ORDER BY trigger_name;
-- Should show 'on_auth_user_created' trigger


-- 4. Check the EXACT function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_user_profile';
-- Check if it includes: VALUES (..., FALSE)


-- 5. Check the most recent user in the database
SELECT
  id,
  full_name,
  welcome_email_sent,
  created_at,
  updated_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 1;
-- This will show your most recent signup


-- 6. Check if there's a default constraint
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
ORDER BY conname;
-- Look for anything related to welcome_email_sent


-- 7. Check table definition
SELECT
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
  a.attnotnull as not_null,
  pg_get_expr(d.adbin, d.adrelid) as default_value
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
WHERE a.attrelid = 'public.user_profiles'::regclass
AND a.attnum > 0
AND NOT a.attisdropped
AND a.attname = 'welcome_email_sent';
-- This shows the RAW default value


-- =====================================================
-- RESULTS TO CHECK:
-- =====================================================
-- Query 1: column_default should be 'false'
-- Query 2: Should only show normal triggers, no UPDATE triggers
-- Query 3: Should show 'on_auth_user_created'
-- Query 4: Function should include: VALUES (..., FALSE)
-- Query 5: Your latest user - check welcome_email_sent value
-- Query 6: No special constraints
-- Query 7: default_value should be 'false'
-- =====================================================
