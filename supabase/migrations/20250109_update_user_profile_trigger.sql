-- =====================================================
-- Update User Profile Creation Trigger
-- =====================================================
-- This updates the trigger to:
-- 1. Save Google avatar URL from OAuth
-- 2. Extract username from email (part before @) when full_name not provided
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

  -- Insert user profile with proper name and avatar
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

-- The trigger should already exist from the previous migration
-- If not, create it:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION create_user_profile();
  END IF;
END $$;
