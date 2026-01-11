-- =====================================================
-- FINAL FIX: Ensure welcome_email_sent defaults to FALSE
-- =====================================================
-- This will fix the issue permanently
-- Run this ONCE in Supabase SQL Editor
-- =====================================================

-- Step 1: Ensure the column exists with correct default
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN;

-- Step 2: Set the default value explicitly (this is the key fix!)
ALTER TABLE public.user_profiles
ALTER COLUMN welcome_email_sent SET DEFAULT FALSE;

-- Step 3: Set NULL values to FALSE (for any existing rows)
UPDATE public.user_profiles
SET welcome_email_sent = FALSE
WHERE welcome_email_sent IS NULL;

-- Step 4: Make the column NOT NULL (optional, but recommended)
ALTER TABLE public.user_profiles
ALTER COLUMN welcome_email_sent SET NOT NULL;

-- Step 5: Update the trigger to explicitly set FALSE
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  display_name TEXT;
  user_avatar TEXT;
BEGIN
  -- Get avatar URL from raw_user_meta_data (Google OAuth provides this)
  user_avatar := NEW.raw_user_meta_data->>'avatar_url';

  -- Determine display name
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    NEW.email
  );

  -- Insert user profile with welcome_email_sent explicitly set to FALSE
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
    FALSE  -- EXPLICIT FALSE - this is critical!
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Verify everything is correct
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'welcome_email_sent';

-- Expected result:
-- column_name: welcome_email_sent
-- data_type: boolean
-- column_default: false
-- is_nullable: NO

-- Step 7: Check existing users
SELECT
  id,
  full_name,
  welcome_email_sent,
  created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 5;

-- All existing users should show welcome_email_sent = false (or manually set to false)

-- =====================================================
-- After running this:
-- 1. Delete your test user from Supabase
-- 2. Sign up again with a fresh account
-- 3. Check: SELECT welcome_email_sent FROM user_profiles WHERE id = 'your-new-id';
-- 4. It should be FALSE!
-- =====================================================
