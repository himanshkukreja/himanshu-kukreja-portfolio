-- =====================================================
-- "Level Up" redesign: game state, stage progress, trials, review queue, real streaks.
-- Additive only: no existing column or table is dropped or rewritten.
-- =====================================================

-- 1. Game state synced for signed-in visitors (guests keep it in localStorage)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS game_done JSONB NOT NULL DEFAULT '{}'::jsonb; -- questId -> epoch ms
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS game_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS handle TEXT; -- Hall of Fame (L5 Staff)

-- 2. Stage-based lesson progress (resume by Part, never by pixel; completion never regresses)
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS completed_stages TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS last_stage TEXT;
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS max_progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS content_version TEXT;

-- Guard: once completed, a lesson stays completed and its progress never goes down.
CREATE OR REPLACE FUNCTION learning_progress_no_regress()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    NEW.status := 'completed';
    NEW.completed_at := COALESCE(OLD.completed_at, NEW.completed_at);
  END IF;
  NEW.max_progress := GREATEST(COALESCE(OLD.max_progress, 0), COALESCE(NEW.progress_percentage, 0), COALESCE(NEW.max_progress, 0));
  NEW.progress_percentage := GREATEST(COALESCE(OLD.progress_percentage, 0), COALESCE(NEW.progress_percentage, 0));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learning_progress_no_regress ON learning_progress;
CREATE TRIGGER trg_learning_progress_no_regress
  BEFORE UPDATE ON learning_progress
  FOR EACH ROW EXECUTE FUNCTION learning_progress_no_regress();

-- 3. Trials: one attempt per run of a 25-question part
CREATE TABLE IF NOT EXISTS trial_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  part INTEGER NOT NULL,
  seed TEXT NOT NULL,                  -- option shuffle seed for this attempt
  answers JSONB NOT NULL DEFAULT '{}', -- question number -> original option letter
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_trial_attempts_user ON trial_attempts(user_id, course_id, week, part, started_at DESC);
ALTER TABLE trial_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trial attempts: own rows" ON trial_attempts;
CREATE POLICY "trial attempts: own rows" ON trial_attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Review queue (Leitner boxes 1-5) fed by missed trial questions, flags, highlights, interview cards
CREATE TABLE IF NOT EXISTS review_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('trial_miss', 'trial_flag', 'highlight', 'interview')),
  source_ref TEXT NOT NULL,            -- e.g. 'week-02:q57' or a content_notes id
  course_id TEXT NOT NULL,
  week TEXT,
  lesson_slug TEXT,
  stage TEXT,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due_at DATE NOT NULL DEFAULT CURRENT_DATE,
  last_grade TEXT CHECK (last_grade IN ('again', 'hard', 'good', 'easy')),
  reviews INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_review_cards_due ON review_cards(user_id, due_at);
ALTER TABLE review_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review cards: own rows" ON review_cards;
CREATE POLICY "review cards: own rows" ON review_cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Real streaks: any stage, lesson, trial or review session marks the day active
CREATE OR REPLACE FUNCTION record_learning_activity(p_user UUID)
RETURNS VOID AS $$
DECLARE
  streak INTEGER := 0;
  d DATE := CURRENT_DATE;
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN;
  END IF;
  INSERT INTO learning_streaks (user_id, activity_date) VALUES (p_user, CURRENT_DATE)
    ON CONFLICT (user_id, activity_date) DO NOTHING;
  -- count consecutive active days ending today
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM learning_streaks WHERE user_id = p_user AND activity_date = d);
    streak := streak + 1;
    d := d - 1;
  END LOOP;
  UPDATE user_profiles
    SET current_streak = streak,
        longest_streak = GREATEST(COALESCE(longest_streak, 0), streak)
    WHERE id = p_user;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION record_learning_activity(UUID) TO authenticated;
