-- =====================================================
-- Update Trigger to Explicitly Set welcome_email_sent = FALSE
-- =====================================================
-- This ensures ALL new users get welcome_email_sent = FALSE
-- Run this in Supabase SQL Editor
-- =====================================================

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  display_name TEXT;
  user_avatar TEXT;
BEGIN
  -- Get avatar URL from raw_user_meta_data (Google OAuth provides this)
  user_avatar := NEW.raw_user_meta_data->>'avatar_url';

  -- Determine display name:
  -- 1. Try to get full_name from OAuth (Google provides this)
  -- 2. If not available, extract username from email (part before @)
  -- 3. Fallback to email if extraction fails
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    NEW.email
  );

  -- Insert user profile with proper name, avatar, and welcome_email_sent = FALSE
  INSERT INTO public.user_profiles (id, full_name, avatar_url, welcome_email_sent)
  VALUES (
    NEW.id,
    display_name,
    user_avatar,
    FALSE  -- Explicitly set to FALSE so welcome email will be sent
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the trigger exists
SELECT
  tgname as trigger_name,
  tgenabled as enabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';

-- Expected: 1 row with enabled = 'O' (enabled)
