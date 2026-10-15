-- =====================================================
-- OPTIONAL — Learn Arena: quick-check answers, daily results, materialized leaderboard.
-- NOT applied. The Arena works without it (it scores from learning_progress, analytics_events and
-- learning_streaks; see src/lib/learn/arena/leaderboard.ts). Applying it would let the server:
--   * keep one authoritative row per answer / daily run (no reliance on the analytics pipeline,
--     which drops events under GPC/DNT, ad-blockers and hk.notrack),
--   * enforce "one scored daily run per user per day" with a unique key and server-side timing,
--   * read the board from a small table instead of re-scoring every event each minute.
-- Additive only.
-- =====================================================

-- 1. Quick-check answers (first attempt per question is the one that scores)
CREATE TABLE IF NOT EXISTS quiz_answers (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,          -- quiz:<course>/<week>/<lesson>:<block>:<q>
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,
  pick SMALLINT NOT NULL,
  correct BOOLEAN NOT NULL,           -- computed server-side from the question bank
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)  -- first answer wins (INSERT … ON CONFLICT DO NOTHING)
);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_time ON quiz_answers(answered_at);
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz answers: read own" ON quiz_answers;
CREATE POLICY "quiz answers: read own" ON quiz_answers FOR SELECT USING (auth.uid() = user_id);
-- writes go through an API route with the service role (the route re-checks `correct`)

-- 2. Daily challenge runs: one scored run per user per IST day
CREATE TABLE IF NOT EXISTS daily_results (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,                  -- Asia/Kolkata day
  picks SMALLINT[] NOT NULL,
  correct SMALLINT NOT NULL,          -- re-checked server-side
  total SMALLINT NOT NULL,
  ms INTEGER NOT NULL,                -- ideally server-timed: started_at → finished_at
  score INTEGER NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_results_day ON daily_results(day);
ALTER TABLE daily_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily results: read own" ON daily_results;
CREATE POLICY "daily results: read own" ON daily_results FOR SELECT USING (auth.uid() = user_id);

-- 3. Materialized weekly points + league tier (written by a cron / the leaderboard route)
CREATE TABLE IF NOT EXISTS arena_weekly (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,           -- Monday, Asia/Kolkata
  points INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  tier SMALLINT NOT NULL DEFAULT 0,   -- 0 = L1 Intern … 5 = L6 Principal (tier during this week)
  promoted BOOLEAN,                   -- set when the week closes
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_arena_weekly_board ON arena_weekly(week_start, tier, points DESC);
ALTER TABLE arena_weekly ENABLE ROW LEVEL SECURITY;
-- public board is served by the API (names shortened there); no direct client access needed

-- 4. Faster scoring from analytics_events while the event path is still used
CREATE INDEX IF NOT EXISTS idx_analytics_events_learn_user
  ON analytics_events ((metadata->>'name'), user_id, created_at)
  WHERE event_type = 'event' AND user_id IS NOT NULL;
