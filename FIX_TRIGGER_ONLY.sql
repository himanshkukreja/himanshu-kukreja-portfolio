-- =====================================================
-- FIX TRIGGER ONLY: Update just the trigger function
-- =====================================================
-- The column default is correct (false)
-- But the trigger might not be explicitly setting it
-- =====================================================

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

  -- CRITICAL: Explicitly set welcome_email_sent = FALSE
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
    FALSE  -- EXPLICIT FALSE HERE!
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the update
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_user_profile';

-- =====================================================
-- After running this:
-- 1. Delete your test user from Supabase
-- 2. Sign up with fresh email
-- 3. Check if welcome_email_sent = FALSE
-- =====================================================
