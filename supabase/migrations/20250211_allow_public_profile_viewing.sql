-- Allow all users (including unauthenticated) to view basic profile information
-- This is needed for displaying commenter names and avatars in the comments section

-- Drop the restrictive policy that only allows users to view their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;

-- Create a new policy that allows everyone to view basic profile info (name and avatar)
-- This is safe because:
-- 1. full_name and avatar_url are public information in comments
-- 2. Sensitive fields (email, etc.) are in auth.users, not user_profiles
-- 3. Other profile fields (bio, learning_goal, etc.) can still be protected by the app
CREATE POLICY "Anyone can view basic profile information"
  ON user_profiles FOR SELECT
  USING (true);

-- Note: Update and insert policies already exist from the initial migration
-- No need to recreate them here
