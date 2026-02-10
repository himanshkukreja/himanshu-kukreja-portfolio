-- Fix foreign key relationships for comments system
-- This creates proper relationships between lesson_comments and user_profiles

-- Drop existing foreign key if it exists
ALTER TABLE lesson_comments DROP CONSTRAINT IF EXISTS lesson_comments_user_id_fkey;
ALTER TABLE comment_mentions DROP CONSTRAINT IF EXISTS comment_mentions_mentioned_user_id_fkey;

-- Add new foreign keys pointing to user_profiles instead of auth.users
ALTER TABLE lesson_comments 
  ADD CONSTRAINT lesson_comments_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

ALTER TABLE comment_mentions 
  ADD CONSTRAINT comment_mentions_mentioned_user_id_fkey 
  FOREIGN KEY (mentioned_user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
