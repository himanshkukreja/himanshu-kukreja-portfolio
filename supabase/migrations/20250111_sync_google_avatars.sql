-- =====================================================
-- Sync Google OAuth Avatars to User Profiles
-- =====================================================
-- This migration syncs avatar URLs from auth.users metadata
-- to user_profiles table for existing Google OAuth users
-- =====================================================

-- Update user_profiles with avatar URLs from auth.users for users who don't have one
UPDATE user_profiles
SET
  avatar_url = auth.users.raw_user_meta_data->>'avatar_url',
  full_name = COALESCE(
    user_profiles.full_name,
    auth.users.raw_user_meta_data->>'full_name'
  ),
  updated_at = NOW()
FROM auth.users
WHERE
  user_profiles.id = auth.users.id
  AND auth.users.raw_user_meta_data->>'avatar_url' IS NOT NULL
  AND (
    user_profiles.avatar_url IS NULL
    OR user_profiles.avatar_url = ''
  );
