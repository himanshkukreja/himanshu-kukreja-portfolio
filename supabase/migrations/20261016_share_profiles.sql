-- =====================================================
-- Share my progress: public learner pages (/u/<handle>) and referral attribution.
-- Additive only. NOT applied automatically — apply it in the Supabase SQL editor.
-- Until it is applied the app keeps working: the settings panel says sharing isn't switched on
-- yet, /u/<handle> answers 404 and referral writes are skipped.
--
-- Reads/writes go through our API routes with the service role (handle rules, reserved words and
-- the profanity guard live there). Learners may read their own settings row and flip
-- enabled/visibility directly; nobody can read another learner's row or any referral row.
-- =====================================================

-- 1. Share settings: one row per learner. Sharing is OFF until the learner turns it on.
CREATE TABLE IF NOT EXISTS share_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  handle TEXT NOT NULL,
  -- { name: "full"|"first"|"none", avatar, progress, tree, streak, scores, badges, milestones }
  visibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 3–24 chars: a–z, 0–9, single hyphens, letter/digit at both ends (same rule as src/lib/share/handle.ts)
  CONSTRAINT share_profiles_handle_format CHECK (
    handle ~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$' AND handle !~ '--'
  ),
  CONSTRAINT share_profiles_visibility_object CHECK (jsonb_typeof(visibility) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS share_profiles_handle_key ON share_profiles (handle);
CREATE INDEX IF NOT EXISTS share_profiles_enabled_idx ON share_profiles (enabled) WHERE enabled;

CREATE OR REPLACE FUNCTION share_profiles_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_share_profiles_touch ON share_profiles;
CREATE TRIGGER trg_share_profiles_touch
  BEFORE UPDATE ON share_profiles
  FOR EACH ROW EXECUTE FUNCTION share_profiles_touch();

ALTER TABLE share_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "share profiles: read own" ON share_profiles;
CREATE POLICY "share profiles: read own" ON share_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "share profiles: update own" ON share_profiles;
CREATE POLICY "share profiles: update own" ON share_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Column privileges: a learner may only flip enabled / visibility on their own row. Creating a row
-- and choosing or changing the handle go through POST/PUT /api/learn/share (service role), which
-- enforces reserved words and the profanity guard.
REVOKE ALL ON share_profiles FROM anon, authenticated;
GRANT SELECT ON share_profiles TO authenticated;
GRANT UPDATE (enabled, visibility) ON share_profiles TO authenticated;

-- 2. Referrals: who brought whom, and how far they got.
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ref_handle TEXT NOT NULL,              -- the handle in the link at the time (handles can change)
  visitor_id TEXT,                       -- analytics visitor id of the browser that followed the link
  landing_path TEXT,
  channel TEXT,                          -- whatsapp | linkedin | x | copy | native | direct
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_up_at TIMESTAMPTZ,              -- auth.users.created_at of the referred account
  first_lesson_started_at TIMESTAMPTZ,   -- filled from learning_progress
  first_lesson_at TIMESTAMPTZ,           -- first completed lesson
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_not_self CHECK (referred_user_id IS NULL OR referred_user_id <> referrer_user_id)
);

-- one visit row per referrer × browser; one referrer per referred account (first claim wins)
CREATE UNIQUE INDEX IF NOT EXISTS referrals_visitor_key ON referrals (referrer_user_id, visitor_id) WHERE visitor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_key ON referrals (referred_user_id) WHERE referred_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_user_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS referrals_seen_idx ON referrals (first_seen_at DESC);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
-- no policies: only the service role (API routes, admin) reads or writes referrals
REVOKE ALL ON referrals FROM anon, authenticated;
