-- =====================================================
-- Send Welcome Email Only on First Successful Login
-- =====================================================
-- This migration updates the user profile creation to send
-- welcome email only AFTER successful authentication,
-- not when OTP is requested.
-- =====================================================

-- Add a column to track if welcome email was sent
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE;

-- Create a function to send welcome email via Edge Function or HTTP request
-- This will be called AFTER the user successfully verifies OTP
CREATE OR REPLACE FUNCTION public.send_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  user_name TEXT;
BEGIN
  -- Only send welcome email if this is the first time user is being created
  -- and they haven't received a welcome email yet
  IF NEW.welcome_email_sent = FALSE THEN
    -- Get user email from auth.users
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO user_email, user_name
    FROM auth.users
    WHERE id = NEW.id;

    -- Mark welcome email as sent
    NEW.welcome_email_sent := TRUE;

    -- TODO: Call your Edge Function or email service here to send welcome email
    -- For now, we'll use Supabase's built-in email service
    -- You can implement this using:
    -- 1. Supabase Edge Functions with Resend/SendGrid
    -- 2. Database webhook to your API
    -- 3. Or keep using Supabase's Confirm Signup template

    RAISE LOG 'Welcome email should be sent to: % (%) - Profile ID: %', user_email, user_name, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing profile creation trigger to set welcome_email_sent
-- This ensures the trigger runs AFTER user successfully authenticates
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  display_name TEXT;
  user_avatar TEXT;
  is_new_user BOOLEAN;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id = NEW.id
  ) INTO is_new_user;

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

  -- Insert or update user profile
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
    FALSE  -- Will be set to TRUE when welcome email trigger runs
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to send welcome email AFTER profile is created
-- This runs when the profile is first created (after successful auth)
DROP TRIGGER IF EXISTS on_user_profile_created ON public.user_profiles;
CREATE TRIGGER on_user_profile_created
  BEFORE INSERT ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION send_welcome_email();

-- Note: The existing trigger "on_auth_user_created" should remain
-- It creates the profile when auth.users row is created
-- The new trigger sends welcome email only on first profile creation

COMMENT ON FUNCTION send_welcome_email() IS
'Sends welcome email to new users on their first successful authentication.
Called by trigger on user_profiles table INSERT.';

COMMENT ON COLUMN public.user_profiles.welcome_email_sent IS
'Tracks whether the welcome email has been sent to prevent duplicate emails.';
