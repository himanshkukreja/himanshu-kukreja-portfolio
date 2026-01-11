-- =====================================================
-- Fix Welcome Email Timing - Send AFTER First Successful Login
-- =====================================================
-- This ensures:
-- 1. OTP/Magic Link email is ALWAYS sent (Supabase default)
-- 2. Welcome email is sent ONLY after first successful authentication
-- =====================================================

-- Drop the previous approach (trigger on user_profiles)
DROP TRIGGER IF EXISTS on_user_profile_created ON public.user_profiles;
DROP FUNCTION IF EXISTS public.send_welcome_email();

-- The issue: Supabase creates auth.users BEFORE email verification
-- We need to detect when a user COMPLETES their first authentication

-- Solution: Use a separate table to track first successful logins
CREATE TABLE IF NOT EXISTS public.user_login_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  login_method TEXT, -- 'otp', 'oauth_google', etc.

  -- Index for fast lookups
  CONSTRAINT unique_user_login UNIQUE (user_id, login_at)
);

CREATE INDEX IF NOT EXISTS idx_user_login_history_user_id
ON public.user_login_history(user_id);

-- Function to check if this is user's first successful login
CREATE OR REPLACE FUNCTION public.is_first_login(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  login_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO login_count
  FROM public.user_login_history
  WHERE user_id = user_uuid;

  RETURN (login_count = 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record login and send welcome email if first time
CREATE OR REPLACE FUNCTION public.record_user_login()
RETURNS TRIGGER AS $$
DECLARE
  is_new_user BOOLEAN;
  user_email TEXT;
BEGIN
  -- Check if this is the first login
  is_new_user := public.is_first_login(NEW.id);

  IF is_new_user THEN
    -- Record the login
    INSERT INTO public.user_login_history (user_id, login_method)
    VALUES (NEW.id,
      CASE
        WHEN NEW.raw_user_meta_data->>'provider' IS NOT NULL
        THEN 'oauth_' || (NEW.raw_user_meta_data->>'provider')
        ELSE 'otp'
      END
    );

    -- Get user email for logging
    user_email := NEW.email;

    -- Log that welcome email should be sent
    RAISE LOG 'FIRST LOGIN DETECTED - Send welcome email to: % (User ID: %)', user_email, NEW.id;

    -- Mark in user_profiles that welcome email should be sent
    UPDATE public.user_profiles
    SET welcome_email_sent = TRUE
    WHERE id = NEW.id;

    -- TODO: Actually send welcome email here
    -- Option 1: Call Edge Function
    -- PERFORM net.http_post(...)

    -- Option 2: Will be handled by application code checking welcome_email_sent flag
  ELSE
    -- Just record the login
    INSERT INTO public.user_login_history (user_id, login_method)
    VALUES (NEW.id,
      CASE
        WHEN NEW.raw_user_meta_data->>'provider' IS NOT NULL
        THEN 'oauth_' || (NEW.raw_user_meta_data->>'provider')
        ELSE 'otp'
      END
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- However, the above won't work because auth.users updates don't reliably trigger on successful auth
-- Better approach: Detect first login in application code (AuthContext)

-- Simpler solution: Check on profile creation if email is verified
CREATE OR REPLACE FUNCTION public.check_and_send_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  user_email_verified BOOLEAN;
  user_email TEXT;
BEGIN
  -- Only proceed if welcome email hasn't been sent
  IF NEW.welcome_email_sent = FALSE THEN
    -- Check if user's email is verified in auth.users
    SELECT
      email_confirmed_at IS NOT NULL,
      email
    INTO
      user_email_verified,
      user_email
    FROM auth.users
    WHERE id = NEW.id;

    -- If email is verified, mark welcome email as sent
    -- (The actual sending will be handled by application code)
    IF user_email_verified THEN
      NEW.welcome_email_sent := TRUE;
      RAISE LOG 'User email verified - Welcome email should be sent to: % (User ID: %)', user_email, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on profile updates to check if email was verified
DROP TRIGGER IF EXISTS check_welcome_email_on_profile_update ON public.user_profiles;
CREATE TRIGGER check_welcome_email_on_profile_update
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_and_send_welcome_email();

-- Also check on insert (in case profile is created after verification)
DROP TRIGGER IF EXISTS check_welcome_email_on_profile_insert ON public.user_profiles;
CREATE TRIGGER check_welcome_email_on_profile_insert
  BEFORE INSERT ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_and_send_welcome_email();

-- Update the profile creation function to not immediately send welcome email
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  display_name TEXT;
  user_avatar TEXT;
  email_verified BOOLEAN;
BEGIN
  -- Get avatar URL from raw_user_meta_data (Google OAuth provides this)
  user_avatar := NEW.raw_user_meta_data->>'avatar_url';

  -- Determine display name
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
    NEW.email
  );

  -- Check if email is already verified (OAuth case)
  email_verified := (NEW.email_confirmed_at IS NOT NULL);

  -- Insert user profile
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
    FALSE  -- Will be set by trigger when email is verified
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the auth trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

COMMENT ON FUNCTION check_and_send_welcome_email() IS
'Checks if user email is verified and marks welcome_email_sent = TRUE.
Called by trigger on user_profiles INSERT and UPDATE.
Actual email sending should be handled by application code.';

COMMENT ON TABLE public.user_login_history IS
'Tracks user login history for analytics and first-login detection.';
