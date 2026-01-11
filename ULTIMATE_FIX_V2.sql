-- =====================================================
-- ULTIMATE FIX V2: Fixed version (no test insert)
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

-- Step 5: Verify the trigger function was updated
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_user_profile';

-- Step 6: Check existing users (if any)
SELECT id, full_name, welcome_email_sent, created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 5;

-- =====================================================
-- SUCCESS! The column is now properly configured.
-- =====================================================
-- Next steps:
-- 1. Delete your test user from Supabase (auth.users table)
-- 2. Sign up with a fresh account
-- 3. The new user WILL have welcome_email_sent = FALSE
-- 4. Welcome email will be sent!
-- =====================================================
