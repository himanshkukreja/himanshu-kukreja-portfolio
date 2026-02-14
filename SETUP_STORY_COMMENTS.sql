-- Quick setup for Story Comments feature
-- Run this in your Supabase SQL Editor

-- Create story_comments table
CREATE TABLE IF NOT EXISTS story_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  story_slug TEXT NOT NULL,
  parent_id UUID REFERENCES story_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  raw_content TEXT,
  is_edited BOOLEAN DEFAULT false,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create story_comment_votes table
CREATE TABLE IF NOT EXISTS story_comment_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES story_comments(id) ON DELETE CASCADE,
  vote_type TEXT CHECK (vote_type IN ('upvote', 'downvote')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, comment_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_story_comments_story ON story_comments(story_slug);
CREATE INDEX IF NOT EXISTS idx_story_comments_parent ON story_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_story_comments_user ON story_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_story_comment_votes_comment ON story_comment_votes(comment_id);
CREATE INDEX IF NOT EXISTS idx_story_comment_votes_user ON story_comment_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_story_comments_created ON story_comments(created_at DESC);

-- Enable RLS
ALTER TABLE story_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_comment_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for story_comments
CREATE POLICY "Anyone can view story comments" ON story_comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create story comments" ON story_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own story comments" ON story_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own story comments" ON story_comments
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for story_comment_votes
CREATE POLICY "Anyone can view story votes" ON story_comment_votes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create story votes" ON story_comment_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own story votes" ON story_comment_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own story votes" ON story_comment_votes
  FOR DELETE USING (auth.uid() = user_id);
