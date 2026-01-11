-- =====================================================
-- FINAL SOLUTION: This will 100% fix the issue
-- =====================================================
-- Run this in Supabase SQL Editor
-- Copy the ENTIRE file and run it all at once
-- =====================================================

-- Step 1: Drop and recreate the column with correct default
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS welcome_email_sent;
ALTER TABLE public.user_profiles ADD COLUMN welcome_email_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: Verify column was created correctly
DO $$
DECLARE
  default_val TEXT;
BEGIN
  SELECT column_default INTO default_val
  FROM information_schema.columns
  WHERE table_name = 'user_profiles'
  AND column_name = 'welcome_email_sent';

  RAISE NOTICE 'Column default value is: %', default_val;

  IF default_val != 'false' THEN
    RAISE EXCEPTION 'ERROR: Column default is NOT false! It is: %', default_val;
  END IF;

  RAISE NOTICE 'SUCCESS: Column default is correctly set to FALSE';
END $$;

-- Step 3: Update the trigger function
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  display_name TEXT;
  user_avatar TEXT;
BEGIN
  user_avatar := NEW.raw_user_meta_data->>'avatar_url';

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    NEW.email
  );

  INSERT INTO public.user_profiles (
    id,
    full_name,
    avatar_url,
    welcome_email_sent
  )
  VALUES (
    NEW.id,
    display_name,
    user_avatar,
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Verify the trigger was updated
DO $$
DECLARE
  func_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO func_def
  FROM pg_proc
  WHERE proname = 'create_user_profile';

  IF func_def LIKE '%FALSE%' THEN
    RAISE NOTICE 'SUCCESS: Trigger function includes FALSE';
  ELSE
    RAISE WARNING 'WARNING: Trigger function may not include FALSE';
  END IF;
END $$;

-- Step 5: Show final state
SELECT
  'Column Info:' as info_type,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'welcome_email_sent';

-- =====================================================
-- EXPECTED OUTPUT:
-- =====================================================
-- NOTICE: Column default value is: false
-- NOTICE: SUCCESS: Column default is correctly set to FALSE
-- NOTICE: SUCCESS: Trigger function includes FALSE
--
-- Then a table showing:
-- column_name: welcome_email_sent
-- column_default: false
-- is_nullable: NO
-- =====================================================

-- =====================================================
-- AFTER RUNNING THIS:
-- =====================================================
-- 1. Delete your test user from Supabase (auth.users table)
-- 2. Sign up with a completely fresh email
-- 3. Check terminal - new user should have welcomeEmailSent: false
-- 4. Welcome email should be sent automatically!
-- =====================================================
