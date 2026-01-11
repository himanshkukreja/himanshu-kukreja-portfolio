-- =====================================================
-- Authentication & Learning Platform Schema
-- =====================================================
-- This migration sets up:
-- 1. User profiles
-- 2. Learning progress tracking
-- 3. Bookmarks
-- 4. Notes on content
-- =====================================================

-- =====================================================
-- 1. USER PROFILES
-- =====================================================
-- Extends Supabase auth.users with additional profile data
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Profile Information
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,

  -- Learning Preferences
  learning_goal TEXT, -- 'interview-prep', 'skill-building', 'career-growth', 'curiosity'
  experience_level TEXT DEFAULT 'intermediate', -- 'beginner', 'intermediate', 'advanced'

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Privacy Settings
  profile_visibility TEXT DEFAULT 'private', -- 'private', 'public'

  -- Statistics (denormalized for performance)
  total_lessons_completed INTEGER DEFAULT 0,
  total_time_spent INTEGER DEFAULT 0, -- in seconds
  current_streak INTEGER DEFAULT 0, -- days
  longest_streak INTEGER DEFAULT 0 -- days
);

-- =====================================================
-- 2. LEARNING PROGRESS
-- =====================================================
-- Tracks completion status for each lesson
CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Lesson Identification
  course_id TEXT NOT NULL, -- e.g., 'system-design-mastery'
  week TEXT NOT NULL, -- e.g., 'week-01-data-at-scale'
  lesson_slug TEXT NOT NULL, -- e.g., 'day-01-partitioning-deep-dive'

  -- Progress Details
  status TEXT DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
  progress_percentage INTEGER DEFAULT 0, -- 0-100

  -- Time Tracking
  time_spent INTEGER DEFAULT 0, -- seconds spent on this lesson
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one progress record per user per lesson
  UNIQUE(user_id, course_id, week, lesson_slug)
);

-- =====================================================
-- 3. BOOKMARKS
-- =====================================================
-- Allows users to bookmark lessons for quick access
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Bookmarked Content
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,

  -- Optional metadata
  note TEXT, -- Personal note about why bookmarked
  tags TEXT[], -- Custom tags for organization

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one bookmark per user per lesson
  UNIQUE(user_id, course_id, week, lesson_slug)
);

-- =====================================================
-- 4. CONTENT NOTES
-- =====================================================
-- Allows users to add notes to specific parts of content
CREATE TABLE IF NOT EXISTS content_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content Location
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,

  -- Note Details
  note_text TEXT NOT NULL,
  note_type TEXT DEFAULT 'general', -- 'general', 'question', 'important', 'todo'

  -- Optional: Anchor to specific text in content
  highlight_text TEXT, -- The text that was highlighted
  highlight_offset INTEGER, -- Position in the content

  -- Color coding for visual organization
  color TEXT DEFAULT 'yellow', -- 'yellow', 'green', 'blue', 'red', 'purple'

  -- Privacy
  is_private BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 5. LEARNING STREAKS
-- =====================================================
-- Tracks daily learning activity for streak calculation
CREATE TABLE IF NOT EXISTS learning_streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Streak Date
  activity_date DATE NOT NULL,

  -- Activity Details
  lessons_completed INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0, -- seconds

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one record per user per day
  UNIQUE(user_id, activity_date)
);

-- =====================================================
-- INDEXES for Performance
-- =====================================================

-- User Profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at DESC);

-- Learning Progress
CREATE INDEX IF NOT EXISTS idx_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_course ON learning_progress(course_id, week);
CREATE INDEX IF NOT EXISTS idx_learning_progress_status ON learning_progress(user_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_progress_updated_at ON learning_progress(updated_at DESC);

-- Bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(user_id, created_at DESC);

-- Content Notes
CREATE INDEX IF NOT EXISTS idx_content_notes_user_id ON content_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_content_notes_lesson ON content_notes(course_id, week, lesson_slug);
CREATE INDEX IF NOT EXISTS idx_content_notes_created_at ON content_notes(created_at DESC);

-- Learning Streaks
CREATE INDEX IF NOT EXISTS idx_learning_streaks_user_date ON learning_streaks(user_id, activity_date DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_streaks ENABLE ROW LEVEL SECURITY;

-- User Profiles Policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Learning Progress Policies
CREATE POLICY "Users can view their own progress"
  ON learning_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress"
  ON learning_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress"
  ON learning_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own progress"
  ON learning_progress FOR DELETE
  USING (auth.uid() = user_id);

-- Bookmarks Policies
CREATE POLICY "Users can view their own bookmarks"
  ON bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bookmarks"
  ON bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookmarks"
  ON bookmarks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks"
  ON bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- Content Notes Policies
CREATE POLICY "Users can view their own notes"
  ON content_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notes"
  ON content_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
  ON content_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON content_notes FOR DELETE
  USING (auth.uid() = user_id);

-- Learning Streaks Policies
CREATE POLICY "Users can view their own streaks"
  ON learning_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streaks"
  ON learning_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaks"
  ON learning_streaks FOR UPDATE
  USING (auth.uid() = user_id);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function: Update user_profiles.updated_at on changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update updated_at for user_profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update updated_at for learning_progress
CREATE TRIGGER update_learning_progress_updated_at
  BEFORE UPDATE ON learning_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update updated_at for bookmarks
CREATE TRIGGER update_bookmarks_updated_at
  BEFORE UPDATE ON bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update updated_at for content_notes
CREATE TRIGGER update_content_notes_updated_at
  BEFORE UPDATE ON content_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Automatically create user profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- Function: Update streak when progress is completed
CREATE OR REPLACE FUNCTION update_learning_streak()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update streak if lesson was just completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Insert or update today's streak record
    INSERT INTO learning_streaks (user_id, activity_date, lessons_completed, time_spent)
    VALUES (NEW.user_id, CURRENT_DATE, 1, NEW.time_spent)
    ON CONFLICT (user_id, activity_date)
    DO UPDATE SET
      lessons_completed = learning_streaks.lessons_completed + 1,
      time_spent = learning_streaks.time_spent + NEW.time_spent;

    -- Update user profile statistics
    UPDATE user_profiles
    SET
      total_lessons_completed = total_lessons_completed + 1,
      total_time_spent = total_time_spent + NEW.time_spent,
      last_seen_at = NOW()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Update streak on lesson completion
CREATE TRIGGER on_lesson_completed
  AFTER INSERT OR UPDATE ON learning_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_streak();

-- =====================================================
-- VIEWS for Analytics
-- =====================================================

-- View: User learning statistics
CREATE OR REPLACE VIEW user_learning_stats AS
SELECT
  up.id as user_id,
  up.full_name,
  up.experience_level,
  up.total_lessons_completed,
  up.total_time_spent,
  up.current_streak,
  up.longest_streak,
  COUNT(DISTINCT lp.lesson_slug) FILTER (WHERE lp.status = 'completed') as completed_lessons,
  COUNT(DISTINCT lp.lesson_slug) FILTER (WHERE lp.status = 'in_progress') as in_progress_lessons,
  COUNT(DISTINCT b.id) as total_bookmarks,
  COUNT(DISTINCT cn.id) as total_notes
FROM user_profiles up
LEFT JOIN learning_progress lp ON up.id = lp.user_id
LEFT JOIN bookmarks b ON up.id = b.user_id
LEFT JOIN content_notes cn ON up.id = cn.user_id
GROUP BY up.id, up.full_name, up.experience_level, up.total_lessons_completed,
         up.total_time_spent, up.current_streak, up.longest_streak;

-- View: Course progress summary per user
CREATE OR REPLACE VIEW course_progress_summary AS
SELECT
  user_id,
  course_id,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
  COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE status = 'not_started') as not_started_count,
  ROUND(AVG(progress_percentage), 2) as avg_progress,
  SUM(time_spent) as total_time_spent,
  MAX(last_accessed_at) as last_accessed_at
FROM learning_progress
GROUP BY user_id, course_id;

-- Grant permissions
GRANT SELECT ON user_learning_stats TO authenticated;
GRANT SELECT ON course_progress_summary TO authenticated;

-- =====================================================
-- INITIAL DATA / SEED
-- =====================================================

-- Add comment for documentation
COMMENT ON TABLE user_profiles IS 'Extended user profile data for learning platform';
COMMENT ON TABLE learning_progress IS 'Tracks lesson completion and progress for each user';
COMMENT ON TABLE bookmarks IS 'User bookmarks for quick access to lessons';
COMMENT ON TABLE content_notes IS 'User notes on specific parts of lesson content';
COMMENT ON TABLE learning_streaks IS 'Daily learning activity for streak tracking';
