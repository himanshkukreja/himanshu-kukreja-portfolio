-- =====================================================
-- Profile photos: the public "avatars" Storage bucket + an upload log for the rate limit
-- =====================================================
-- Learners pick a cartoon (stored as avatar_url = '/avatars/<group>/<id>.svg', files in public/, no
-- storage needed) or upload their own photo. This migration is only for the photo upload.
--
-- Flow (src/app/api/learn/profile/avatar/route.ts):
--   the browser crops the photo to 256×256 on a canvas and re-encodes it (WebP, or JPEG where the
--   browser can't encode WebP), which drops EXIF/GPS → POST to our route with the learner's token →
--   the route checks magic bytes, size and that no metadata block is left → uploads with the
--   SERVICE ROLE to avatars/<user id>/<random>.webp → sets user_profiles.avatar_url to the public URL
--   → deletes that learner's previous file. "Remove" and switching to a cartoon / the Google photo
--   delete the stored file too.
--
-- Access:
--   * Bucket is public: objects are readable at /storage/v1/object/public/avatars/<user id>/<file>
--     (avatars show on comments and public profiles, so they are public by nature).
--   * No storage.objects policy for this bucket = anon / authenticated can't insert, update or delete
--     anything in it. Only the service role (our API route) writes.
--   * The bucket itself caps the size and the types again.
--
-- Additive and idempotent: nothing existing is altered or dropped. Safe to run more than once.

-- ── Storage bucket ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,                               -- 2 MB (a 256×256 crop is ~10–40 KB; the route caps at 2 MB too)
  array['image/webp', 'image/jpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Upload log (rate limit: 10 photo uploads per learner per 24 h) ─────────────────────────────
create table if not exists public.avatar_uploads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  bytes integer not null check (bytes > 0 and bytes <= 2097152),
  created_at timestamptz not null default now()
);

create index if not exists avatar_uploads_user_time on public.avatar_uploads (user_id, created_at desc);

comment on table public.avatar_uploads is
  'One row per profile-photo upload (service role only). Used for the 10-a-day limit in /api/learn/profile/avatar.';

-- Service role only: RLS on with no policies, and no table privileges for the browser roles.
alter table public.avatar_uploads enable row level security;
revoke all on public.avatar_uploads from anon, authenticated;

-- ── Make the API route the only writer of avatar_url (owner-approved 1 Nov 2026) ─────────────
-- 20261015_learn_backend_fixes.sql still grants `update (avatar_url)` on user_profiles to
-- authenticated, so a learner can set any URL from the browser console (the app itself no longer
-- writes it from the browser: every change goes through the route above). Closed here:
revoke update (avatar_url) on public.user_profiles from authenticated;
