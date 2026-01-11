-- =====================================================
-- ULTIMATE FIX: This WILL fix the welcome_email_sent issue
-- =====================================================
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Drop the column completely
ALTER TABLE public.user_profiles
DROP COLUMN IF EXISTS welcome_email_sent;

-- Step 2: Re-add it with proper default
ALTER TABLE public.user_profiles
ADD COLUMN welcome_email_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 3: Verify the column was created correctly
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'welcome_email_sent';

-- Expected result:
-- column_default: false
-- is_nullable: NO

-- Step 4: Update the trigger to explicitly set FALSE
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  display_name TEXT;
  user_avatar TEXT;
BEGIN
  -- Get avatar URL from raw_user_meta_data
  user_avatar := NEW.raw_user_meta_data->>'avatar_url';

  -- Determine display name
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    NEW.email
  );

  -- Insert user profile with welcome_email_sent = FALSE
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
    FALSE  -- EXPLICIT FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Test by creating a dummy profile
INSERT INTO public.user_profiles (id, full_name)
VALUES ('00000000-0000-0000-0000-000000000000', 'TEST USER - DELETE ME')
ON CONFLICT (id) DO NOTHING;

-- Step 6: Check if the test user has welcome_email_sent = FALSE
SELECT id, full_name, welcome_email_sent
FROM public.user_profiles
WHERE id = '00000000-0000-0000-0000-000000000000';

-- Expected: welcome_email_sent should be FALSE

-- Step 7: Clean up test user
DELETE FROM public.user_profiles
WHERE id = '00000000-0000-0000-0000-000000000000';

-- Step 8: Verify all existing users (should be empty after your deletions)
SELECT id, full_name, welcome_email_sent, created_at
FROM public.user_profiles
ORDER BY created_at DESC;

-- =====================================================
-- CRITICAL: After running this SQL:
-- 1. DO NOT run any other migration that UPDATEs welcome_email_sent
-- 2. Delete your current test user from Supabase
-- 3. Sign up fresh
-- 4. The new user WILL have welcome_email_sent = FALSE
-- =====================================================
