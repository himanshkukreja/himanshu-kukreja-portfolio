-- Create comments table for lesson discussions
CREATE TABLE IF NOT EXISTS lesson_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,
  parent_id UUID REFERENCES lesson_comments(id) ON DELETE CASCADE, -- For nested replies
  content TEXT NOT NULL, -- Rich text content (HTML)
  raw_content TEXT, -- Plain text version for search
  is_edited BOOLEAN DEFAULT false,
  edit_history JSONB DEFAULT '[]'::JSONB, -- Track edit history
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false, -- Pin important comments
  is_solution BOOLEAN DEFAULT false, -- Mark as solution/answer
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create votes table to track user votes
CREATE TABLE IF NOT EXISTS comment_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES lesson_comments(id) ON DELETE CASCADE,
  vote_type TEXT CHECK (vote_type IN ('upvote', 'downvote')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, comment_id) -- One vote per user per comment
);

-- Create mentions table for @ mentions
CREATE TABLE IF NOT EXISTS comment_mentions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES lesson_comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_comments_lesson ON lesson_comments(course_id, week, lesson_slug);
CREATE INDEX IF NOT EXISTS idx_lesson_comments_parent ON lesson_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_lesson_comments_user ON lesson_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_votes_comment ON comment_votes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_votes_user ON comment_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user ON comment_mentions(mentioned_user_id);

-- Enable RLS
ALTER TABLE lesson_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_mentions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for lesson_comments
CREATE POLICY "Anyone can view comments" ON lesson_comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create comments" ON lesson_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" ON lesson_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON lesson_comments
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for comment_votes
CREATE POLICY "Anyone can view votes" ON comment_votes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create votes" ON comment_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes" ON comment_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON comment_votes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for comment_mentions
CREATE POLICY "Anyone can view mentions" ON comment_mentions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create mentions" ON comment_mentions
  FOR INSERT WITH CHECK (true);

-- Function to update comment vote counts
CREATE OR REPLACE FUNCTION update_comment_votes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote_type = 'upvote' THEN
      UPDATE lesson_comments SET upvotes = upvotes + 1 WHERE id = NEW.comment_id;
    ELSE
      UPDATE lesson_comments SET downvotes = downvotes + 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote_type = 'upvote' THEN
      UPDATE lesson_comments SET upvotes = upvotes - 1 WHERE id = OLD.comment_id;
    ELSE
      UPDATE lesson_comments SET downvotes = downvotes - 1 WHERE id = OLD.comment_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle vote change
    IF OLD.vote_type = 'upvote' AND NEW.vote_type = 'downvote' THEN
      UPDATE lesson_comments SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE id = NEW.comment_id;
    ELSIF OLD.vote_type = 'downvote' AND NEW.vote_type = 'upvote' THEN
      UPDATE lesson_comments SET downvotes = downvotes - 1, upvotes = upvotes + 1 WHERE id = NEW.comment_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update vote counts
CREATE TRIGGER update_comment_votes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON comment_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_votes();

-- Function to get comment thread with user details
CREATE OR REPLACE FUNCTION get_lesson_comments(
  p_course_id TEXT,
  p_week TEXT,
  p_lesson_slug TEXT
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  user_avatar TEXT,
  parent_id UUID,
  content TEXT,
  raw_content TEXT,
  is_edited BOOLEAN,
  upvotes INTEGER,
  downvotes INTEGER,
  is_pinned BOOLEAN,
  is_solution BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_vote TEXT,
  reply_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    COALESCE(p.full_name, u.email) AS user_name,
    p.avatar_url AS user_avatar,
    c.parent_id,
    c.content,
    c.raw_content,
    c.is_edited,
    c.upvotes,
    c.downvotes,
    c.is_pinned,
    c.is_solution,
    c.created_at,
    c.updated_at,
    v.vote_type AS user_vote,
    COUNT(r.id) AS reply_count
  FROM lesson_comments c
  JOIN auth.users u ON c.user_id = u.id
  LEFT JOIN user_profiles p ON c.user_id = p.id
  LEFT JOIN comment_votes v ON c.id = v.comment_id AND v.user_id = auth.uid()
  LEFT JOIN lesson_comments r ON c.id = r.parent_id
  WHERE c.course_id = p_course_id
    AND c.week = p_week
    AND c.lesson_slug = p_lesson_slug
  GROUP BY c.id, u.email, p.full_name, p.avatar_url, v.vote_type
  ORDER BY c.is_pinned DESC, c.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;