-- =====================================================
-- Design of the week: one open design problem a week. Learners submit a design (markdown +
-- Mermaid), the community votes, the best ones are featured on the course hub and on the winner's
-- public /u/<handle> page.
--
-- Additive only. NOT applied automatically: apply it in the Supabase SQL editor after review.
-- Until it is applied the app keeps working: /learn/design-week says "coming soon", the hub card
-- shows a teaser, the admin screen shows an "apply the migration" banner, and every write answers
-- 503 tables-missing.
--
-- Access model
--   * Every write goes through our API routes (service role). The API derives the user id from
--     the verified access token and enforces phases, ownership, vote rules, voter eligibility,
--     size limits and rate limits (src/lib/design-week/core.ts). Browsers have no write grants.
--   * RLS is on for every table. The browser roles can read only:
--       - challenges that aren't drafts;
--       - their own submissions and votes;
--       - submitted (visible) submissions once the challenge is in voting or later, and only the
--         columns a reader needs: no user_id, no vote_count (counts stay hidden during voting),
--         no moderation fields.
--     Reports are service-role only.
--   * Integrity the database guarantees even for the service role: one submission per learner per
--     challenge, one vote per learner per submission, no self-votes, at most max_votes_per_user
--     votes per learner per challenge, votes only while voting is open, vote_count kept in sync
--     by trigger, one report per learner per submission.
-- =====================================================

-- 1. Phase of a challenge at a point in time. Mirrors phaseOf() in src/lib/design-week/core.ts.
--    status: draft (hidden) | scheduled (phases follow the timestamps) | open / voting (admin
--    override: force that phase now) | closed (winners confirmed, final).
--    phase:  draft | upcoming | open | voting | judging (voting ended, winners pending) | closed
CREATE TABLE IF NOT EXISTS dow_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  brief_md TEXT NOT NULL DEFAULT '',
  constraints JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ["10B links over 5 years", …]
  rubric JSONB NOT NULL DEFAULT '[]'::jsonb,        -- ["Capacity estimate is explicit", …]
  related_lessons TEXT[] NOT NULL DEFAULT '{}',     -- "week-01-data-at-scale/day-03-rate-limiting-at-scale"
  starts_at TIMESTAMPTZ NOT NULL,
  submissions_close_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,                     -- voting closes
  status TEXT NOT NULL DEFAULT 'draft',
  max_votes_per_user INT NOT NULL DEFAULT 3,
  show_live_counts BOOLEAN NOT NULL DEFAULT FALSE,
  featured_submission_ids UUID[] NOT NULL DEFAULT '{}', -- ordered: [winner, runner-up, …]
  winners_announced_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dow_challenges_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT dow_challenges_title_len CHECK (char_length(title) BETWEEN 3 AND 140),
  CONSTRAINT dow_challenges_summary_len CHECK (char_length(summary) <= 280),
  CONSTRAINT dow_challenges_brief_len CHECK (char_length(brief_md) <= 20000),
  CONSTRAINT dow_challenges_lists CHECK (jsonb_typeof(constraints) = 'array' AND jsonb_typeof(rubric) = 'array'),
  CONSTRAINT dow_challenges_status CHECK (status IN ('draft', 'scheduled', 'open', 'voting', 'closed')),
  CONSTRAINT dow_challenges_window CHECK (starts_at < submissions_close_at AND submissions_close_at < ends_at),
  CONSTRAINT dow_challenges_max_votes CHECK (max_votes_per_user BETWEEN 1 AND 20),
  CONSTRAINT dow_challenges_featured_len CHECK (cardinality(featured_submission_ids) <= 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS dow_challenges_slug_key ON dow_challenges (slug);
CREATE INDEX IF NOT EXISTS dow_challenges_status_starts_idx ON dow_challenges (status, starts_at DESC);

CREATE OR REPLACE FUNCTION dow_phase(p_status TEXT, p_starts TIMESTAMPTZ, p_sub_close TIMESTAMPTZ, p_ends TIMESTAMPTZ, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TEXT AS $$
  SELECT CASE
    WHEN p_status = 'draft' THEN 'draft'
    WHEN p_status = 'closed' THEN 'closed'
    WHEN p_status = 'open' THEN 'open'
    WHEN p_status = 'voting' THEN 'voting'
    WHEN p_now < p_starts THEN 'upcoming'
    WHEN p_now < p_sub_close THEN 'open'
    WHEN p_now < p_ends THEN 'voting'
    ELSE 'judging'
  END;
$$ LANGUAGE sql STABLE;

-- 2. Submissions: one per learner per challenge. Drafts autosave; submitted ones can be edited
--    until submissions close. hidden = pending review (auto after 3 reports, or by an admin);
--    removed = taken down by an admin.
CREATE TABLE IF NOT EXISTS dow_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES dow_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',                 -- markdown; Mermaid allowed in ```mermaid fences
  status TEXT NOT NULL DEFAULT 'draft',
  show_author BOOLEAN NOT NULL DEFAULT TRUE,        -- false = always "anonymous learner"
  vote_count INT NOT NULL DEFAULT 0,                -- cached, maintained by trg_dow_votes_count
  report_count INT NOT NULL DEFAULT 0,              -- open reports (maintained by the API)
  edit_count INT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  moderation_note TEXT,
  moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dow_submissions_status CHECK (status IN ('draft', 'submitted', 'hidden', 'removed')),
  CONSTRAINT dow_submissions_title_len CHECK (char_length(title) <= 120),
  -- 40,000 characters in the API; bytes here so multi-byte text still has a hard ceiling
  CONSTRAINT dow_submissions_body_len CHECK (octet_length(body_md) <= 160000),
  CONSTRAINT dow_submissions_counts CHECK (vote_count >= 0 AND report_count >= 0 AND edit_count >= 0),
  CONSTRAINT dow_submissions_note_len CHECK (moderation_note IS NULL OR char_length(moderation_note) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS dow_submissions_one_per_user ON dow_submissions (challenge_id, user_id);
CREATE INDEX IF NOT EXISTS dow_submissions_challenge_status_idx ON dow_submissions (challenge_id, status, vote_count DESC);
CREATE INDEX IF NOT EXISTS dow_submissions_user_idx ON dow_submissions (user_id, created_at DESC);

-- 3. Votes: one per learner per submission.
CREATE TABLE IF NOT EXISTS dow_votes (
  challenge_id UUID NOT NULL REFERENCES dow_challenges(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES dow_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (submission_id, user_id)
);

CREATE INDEX IF NOT EXISTS dow_votes_challenge_user_idx ON dow_votes (challenge_id, user_id);
CREATE INDEX IF NOT EXISTS dow_votes_user_created_idx ON dow_votes (user_id, created_at DESC);

-- 4. Abuse reports: one per learner per submission.
CREATE TABLE IF NOT EXISTS dow_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES dow_submissions(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES dow_challenges(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT dow_reports_reason CHECK (reason IN ('spam', 'plagiarism', 'offensive', 'personal-info', 'off-topic', 'other')),
  CONSTRAINT dow_reports_note_len CHECK (char_length(note) <= 500),
  CONSTRAINT dow_reports_status CHECK (status IN ('open', 'dismissed', 'actioned'))
);

CREATE UNIQUE INDEX IF NOT EXISTS dow_reports_one_per_reporter ON dow_reports (submission_id, reporter_id);
CREATE INDEX IF NOT EXISTS dow_reports_status_idx ON dow_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS dow_reports_reporter_idx ON dow_reports (reporter_id, created_at DESC);

-- 5. Triggers --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION dow_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dow_challenges_touch ON dow_challenges;
CREATE TRIGGER trg_dow_challenges_touch BEFORE UPDATE ON dow_challenges FOR EACH ROW EXECUTE FUNCTION dow_touch();
DROP TRIGGER IF EXISTS trg_dow_submissions_touch ON dow_submissions;
CREATE TRIGGER trg_dow_submissions_touch BEFORE UPDATE ON dow_submissions FOR EACH ROW EXECUTE FUNCTION dow_touch();

-- Vote rules the database enforces (the API checks the same first and answers with a clear
-- message; these are the backstop). The advisory lock serialises one learner's votes in one
-- challenge, so two parallel requests can't both slip under the cap.
CREATE OR REPLACE FUNCTION dow_votes_guard()
RETURNS TRIGGER AS $$
DECLARE
  sub RECORD;
  ch RECORD;
  used INT;
BEGIN
  SELECT challenge_id, user_id, status INTO sub FROM dow_submissions WHERE id = NEW.submission_id;
  IF NOT FOUND OR sub.status <> 'submitted' THEN
    RAISE EXCEPTION 'dow_vote_not_votable' USING ERRCODE = 'P0001';
  END IF;
  IF sub.challenge_id <> NEW.challenge_id THEN
    RAISE EXCEPTION 'dow_vote_wrong_challenge' USING ERRCODE = 'P0001';
  END IF;
  IF sub.user_id = NEW.user_id THEN
    RAISE EXCEPTION 'dow_vote_own' USING ERRCODE = 'P0001';
  END IF;
  SELECT status, starts_at, submissions_close_at, ends_at, max_votes_per_user INTO ch FROM dow_challenges WHERE id = NEW.challenge_id;
  IF dow_phase(ch.status, ch.starts_at, ch.submissions_close_at, ch.ends_at) <> 'voting' THEN
    RAISE EXCEPTION 'dow_vote_closed' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dow_vote:' || NEW.user_id::text || ':' || NEW.challenge_id::text));
  SELECT COUNT(*) INTO used FROM dow_votes WHERE challenge_id = NEW.challenge_id AND user_id = NEW.user_id;
  IF used >= ch.max_votes_per_user THEN
    RAISE EXCEPTION 'dow_vote_limit' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dow_votes_guard ON dow_votes;
CREATE TRIGGER trg_dow_votes_guard BEFORE INSERT ON dow_votes FOR EACH ROW EXECUTE FUNCTION dow_votes_guard();

CREATE OR REPLACE FUNCTION dow_votes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE dow_submissions SET vote_count = vote_count + 1 WHERE id = NEW.submission_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE dow_submissions SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.submission_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dow_votes_count ON dow_votes;
CREATE TRIGGER trg_dow_votes_count AFTER INSERT OR DELETE ON dow_votes FOR EACH ROW EXECUTE FUNCTION dow_votes_count();

-- 6. Row level security -----------------------------------------------------------------------

ALTER TABLE dow_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE dow_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dow_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dow_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON dow_challenges, dow_submissions, dow_votes, dow_reports FROM anon, authenticated;

-- challenges: anyone can read published ones
DROP POLICY IF EXISTS "dow challenges: read published" ON dow_challenges;
CREATE POLICY "dow challenges: read published" ON dow_challenges
  FOR SELECT TO anon, authenticated USING (status <> 'draft');
GRANT SELECT (id, slug, title, summary, brief_md, constraints, rubric, related_lessons, starts_at, submissions_close_at, ends_at, status, max_votes_per_user, show_live_counts, featured_submission_ids, winners_announced_at, created_at, updated_at)
  ON dow_challenges TO anon, authenticated;

-- submissions: public once voting starts (submitted only), always your own
DROP POLICY IF EXISTS "dow submissions: read visible" ON dow_submissions;
CREATE POLICY "dow submissions: read visible" ON dow_submissions
  FOR SELECT TO anon, authenticated USING (
    status = 'submitted'
    AND EXISTS (
      SELECT 1 FROM dow_challenges c
      WHERE c.id = challenge_id
        AND dow_phase(c.status, c.starts_at, c.submissions_close_at, c.ends_at) IN ('voting', 'judging', 'closed')
    )
  );
DROP POLICY IF EXISTS "dow submissions: read own" ON dow_submissions;
CREATE POLICY "dow submissions: read own" ON dow_submissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- column grants: no user_id (anonymous stays anonymous), no vote_count (hidden during voting; the
-- API reveals it when voting closes), no moderation fields
GRANT SELECT (id, challenge_id, title, body_md, status, show_author, submitted_at, created_at, updated_at)
  ON dow_submissions TO anon, authenticated;

-- votes: your own only
DROP POLICY IF EXISTS "dow votes: read own" ON dow_votes;
CREATE POLICY "dow votes: read own" ON dow_votes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT SELECT (challenge_id, submission_id, created_at) ON dow_votes TO authenticated;

-- reports: no policies, no grants (service role only)
