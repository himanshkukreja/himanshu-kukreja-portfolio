-- =====================================================
-- Simple MCQ System
-- =====================================================
-- This migration creates tables for:
-- 1. MCQ assessments (the MCQ documents)
-- 2. MCQ user answers (user's saved answers)
-- =====================================================

-- =====================================================
-- 1. MCQ ASSESSMENTS
-- =====================================================
-- Stores metadata about each MCQ assessment document
CREATE TABLE IF NOT EXISTS mcq_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Assessment Identification
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL, -- the slug of the MCQ document (e.g., 'week-00-mcq-assessment')
  
  -- Assessment Details
  title TEXT NOT NULL,
  description TEXT,
  total_questions INTEGER NOT NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one assessment per lesson
  UNIQUE(course_id, week, lesson_slug)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mcq_assessments_lookup 
  ON mcq_assessments(course_id, week, lesson_slug);

-- =====================================================
-- 2. MCQ USER ANSWERS
-- =====================================================
-- Stores user's selected answers for each question
CREATE TABLE IF NOT EXISTS mcq_user_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES mcq_assessments(id) ON DELETE CASCADE,
  
  -- Question Details
  question_number INTEGER NOT NULL, -- 1-based question number
  
  -- Answer Details
  selected_option TEXT, -- 'A', 'B', 'C', 'D' (null if not answered)
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one answer per question per user per assessment
  UNIQUE(user_id, assessment_id, question_number)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mcq_user_answers_lookup 
  ON mcq_user_answers(user_id, assessment_id);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE mcq_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcq_user_answers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Assessments are viewable by everyone" ON mcq_assessments;
DROP POLICY IF EXISTS "Authenticated users can create assessments" ON mcq_assessments;
DROP POLICY IF EXISTS "Users can view their own answers" ON mcq_user_answers;
DROP POLICY IF EXISTS "Users can create their own answers" ON mcq_user_answers;
DROP POLICY IF EXISTS "Users can update their own answers" ON mcq_user_answers;

-- Assessments: Anyone can read, authenticated can create/update
CREATE POLICY "Assessments are viewable by everyone" 
  ON mcq_assessments FOR SELECT 
  USING (true);

CREATE POLICY "Authenticated users can create assessments" 
  ON mcq_assessments FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

-- User Answers: Users can only see and modify their own answers
CREATE POLICY "Users can view their own answers" 
  ON mcq_user_answers FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own answers" 
  ON mcq_user_answers FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own answers" 
  ON mcq_user_answers FOR UPDATE 
  USING (auth.uid() = user_id);

-- =====================================================
-- 4. TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_mcq_assessments_updated_at ON mcq_assessments;
DROP TRIGGER IF EXISTS update_mcq_user_answers_updated_at ON mcq_user_answers;

CREATE TRIGGER update_mcq_assessments_updated_at
  BEFORE UPDATE ON mcq_assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mcq_user_answers_updated_at
  BEFORE UPDATE ON mcq_user_answers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. COMMENTS
-- =====================================================

COMMENT ON TABLE mcq_assessments IS 'Stores metadata about MCQ assessment documents';
COMMENT ON TABLE mcq_user_answers IS 'Stores user selected answers for MCQ questions';
