-- =====================================================
-- Certificates (System Design Mastery): the course certificate and one per world, each with a
-- public verification page at /cert/<code>.
-- Additive only. NOT applied automatically — apply it in the Supabase SQL editor.
-- Needs 20261014_level_up.sql (trial_attempts, user_profiles.game_done / game_flags), which the
-- earning rules read. Until this file is applied the app keeps working: /learn/certificate shows
-- the checklist with "certificates are switching on soon", /cert/<code> answers 404 and the
-- admin page says the table is missing.
--
-- Every read and write goes through our API routes with the service role (src/lib/certificates):
-- eligibility is recomputed on the server at issue time, the row is signed (HMAC-SHA256, see
-- src/lib/certificates/sign.ts) and the browser never touches these tables.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SDM-7F3K-92QX (course) or W02-4QX8 (world); digits 2–9 and A–Z without I and O
  code TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  -- course-map week folder ("week-02-failure-first-design") for world certificates, NULL for the course
  world_key TEXT,
  -- confirmed by the learner when claiming (same rules as src/lib/certificates/core.ts checkCertName)
  display_name TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- snapshot of what was checked at issue time: counts, trial scores, boss + mock evidence, flags
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- v1.<s|k>.<hex>: HMAC-SHA256 over code|user_id|kind|world_key|display_name|issued_at
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid',
  revoked_at TIMESTAMPTZ,
  -- admin-only; never shown on the public page
  revoke_reason TEXT,
  -- the learner can hide the verification page (it then answers 404)
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  -- first press of "Add to LinkedIn profile"
  linkedin_added_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT certificates_kind CHECK (kind IN ('course', 'world')),
  CONSTRAINT certificates_status CHECK (status IN ('valid', 'revoked')),
  CONSTRAINT certificates_code_format CHECK (
    code ~ '^SDM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$' OR code ~ '^W[0-9]{2}-[2-9A-HJ-NP-Z]{4}$'
  ),
  CONSTRAINT certificates_world_key CHECK (
    (kind = 'course' AND world_key IS NULL)
    OR (kind = 'world' AND world_key ~ '^week-[0-9]{2}(-[a-z0-9]+)*$')
  ),
  CONSTRAINT certificates_code_matches_kind CHECK (
    (kind = 'course' AND code LIKE 'SDM-%')
    OR (kind = 'world' AND code = 'W' || substring(world_key FROM 6 FOR 2) || substring(code FROM 4))
  ),
  CONSTRAINT certificates_name CHECK (
    char_length(display_name) BETWEEN 2 AND 80 AND display_name = btrim(display_name) AND display_name !~ '[<>{}@]'
  ),
  CONSTRAINT certificates_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT certificates_reason CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 500),
  CONSTRAINT certificates_evidence_object CHECK (jsonb_typeof(evidence) = 'object'),
  -- one course certificate per learner, one per world (NULL world_key counts as a value: PG 15+)
  CONSTRAINT certificates_one_per_user UNIQUE NULLS NOT DISTINCT (user_id, kind, world_key)
);

-- verification lookups (the unique index is the code index)
CREATE UNIQUE INDEX IF NOT EXISTS certificates_code_key ON public.certificates (code);
CREATE INDEX IF NOT EXISTS certificates_user_idx ON public.certificates (user_id);
CREATE INDEX IF NOT EXISTS certificates_issued_idx ON public.certificates (issued_at DESC);

CREATE OR REPLACE FUNCTION public.certificates_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_certificates_touch ON public.certificates;
CREATE TRIGGER trg_certificates_touch
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.certificates_touch();

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
-- no policies: only the service role (our API routes and the admin page) reads or writes
REVOKE ALL ON public.certificates FROM anon, authenticated;


-- Verification page views per certificate per day (admin stat "verification views, 30 days").
CREATE TABLE IF NOT EXISTS public.certificate_views (
  certificate_id UUID NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (certificate_id, day)
);

ALTER TABLE public.certificate_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_views FROM anon, authenticated;

-- +1 view today (IST day, like the rest of the learn tables) for a public certificate, by code, in
-- one call. Called by POST /api/cert/<code>/view; unknown or private codes are ignored.
DROP FUNCTION IF EXISTS public.certificate_view_bump(UUID);
CREATE OR REPLACE FUNCTION public.certificate_view_bump(p_code TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO certificate_views (certificate_id, day, views)
  SELECT id, (NOW() AT TIME ZONE 'Asia/Kolkata')::date, 1 FROM certificates WHERE code = p_code AND is_public
  ON CONFLICT (certificate_id, day) DO UPDATE SET views = certificate_views.views + 1;
$$;

REVOKE EXECUTE ON FUNCTION public.certificate_view_bump(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.certificate_view_bump(TEXT) TO service_role;
