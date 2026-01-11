-- =====================================================
-- VERIFICATION QUERIES
-- Run these in Supabase SQL Editor to verify setup
-- =====================================================

-- 1. Check if all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'user_profiles',
  'learning_progress',
  'bookmarks',
  'content_notes',
  'learning_streaks'
);
-- Expected: 5 rows

-- 2. Check if the trigger exists
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Expected: 1 row showing the trigger

-- 3. Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('user_profiles', 'learning_progress', 'bookmarks', 'content_notes', 'learning_streaks');
-- Expected: All should show rowsecurity = true

-- 4. Test the create_user_profile function
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'create_user_profile';
-- Expected: Should show the function

-- =====================================================
-- FIX: If trigger is missing or broken, run this:
-- =====================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the function
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_profile();

-- =====================================================
-- GRANT PERMISSIONS (run if you get permission errors)
-- =====================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- =====================================================
-- TEST: Manually create a test profile
-- =====================================================

-- Check current user count
SELECT COUNT(*) FROM auth.users;

-- If you have a user but no profile, manually create one:
-- (Replace USER_ID with actual user ID from auth.users)
/*
INSERT INTO user_profiles (id, full_name)
SELECT id, email FROM auth.users WHERE id = 'YOUR_USER_ID'
ON CONFLICT (id) DO NOTHING;
*/
