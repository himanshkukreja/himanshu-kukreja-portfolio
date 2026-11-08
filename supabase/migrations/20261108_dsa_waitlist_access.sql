-- =====================================================
-- DSA Mastery pre-launch: products, access grants (founding members) and the waitlist.
-- Additive only. NOT applied automatically — apply it in the Supabase SQL editor.
-- Until it is applied the app keeps working: POST /api/dsa/waitlist answers "the waitlist isn't open
-- just yet" (503) and GET answers "not joined".
--
-- The founding offer (plan: dsa-mastery-plan.md §1.4, §14.3, §15): every account created while a
-- product's free window is open, and every email that joins the DSA waitlist while DSA's window is open,
-- keeps BOTH courses (System Design Mastery and DSA Mastery) free for life, with fair-use AI.
--
--   products               one row per course; the free window is open while free_until is null or ahead
--   course_access_grants   who has access to what, and why (kind = founding | paid | comp | trial)
--   dsa_waitlist           the coming-soon page's signups (email unique; linked to an account when known)
--
-- Reads and writes go through our API routes with the service role. Learners may read the products, their
-- own grants and their own waitlist row; nobody writes any of these from the browser.
--
-- Nothing here grants anything to existing accounts. At launch (plan §15.4) run, once per product:
--   select public.backfill_founding_access('dsa');
--   select public.backfill_founding_access('sdm');
-- and set the window's end when it is announced:
--   update public.products set free_until = '<timestamp>' where id in ('sdm', 'dsa');
-- =====================================================

-- 1. Products --------------------------------------------------------------------------------------
create table if not exists public.products (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,31}$'),
  name text not null check (length(name) between 1 and 80),
  -- the founding window: open while this is null (no end announced yet) or in the future
  free_until timestamptz,
  -- false: everything is free for everyone; true: gated features check course_access_grants
  paywall_on boolean not null default false,
  -- when the product launched (DSA: launch day; the points ledger counts from here)
  launch_at timestamptz,
  -- when the end of the free window was announced
  announced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- the dsa row exists now, so coming-soon signups are founding members straight away
insert into public.products (id, name) values
  ('sdm', 'System Design Mastery'),
  ('dsa', 'DSA Mastery')
on conflict (id) do nothing;

create or replace function public.products_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch
  before update on public.products
  for each row execute function public.products_touch();

alter table public.products enable row level security;

drop policy if exists "products: read all" on public.products;
create policy "products: read all" on public.products
  for select using (true);

revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;

-- 2. Access grants ---------------------------------------------------------------------------------
create table if not exists public.course_access_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null references public.products(id) on update cascade,
  -- founding: joined during the free window (for life); paid / comp / trial: later
  kind text not null check (kind in ('founding', 'paid', 'comp', 'trial')),
  -- where it came from: signup | waitlist | dsa-waitlist | backfill | admin | ...
  source text check (source is null or source ~ '^[a-z0-9][a-z0-9:_-]{0,63}$'),
  granted_at timestamptz not null default now(),
  -- null = no end (founding grants never expire)
  expires_at timestamptz,
  revoked_at timestamptz,
  note text check (note is null or length(note) <= 200),
  constraint course_access_grants_expiry check (expires_at is null or expires_at > granted_at)
);

-- one grant of each kind per learner and product (re-granting is a no-op)
create unique index if not exists course_access_grants_one_kind on public.course_access_grants (user_id, product, kind);
create index if not exists course_access_grants_product_kind_idx on public.course_access_grants (product, kind) where revoked_at is null;

alter table public.course_access_grants enable row level security;

drop policy if exists "course access grants: read own" on public.course_access_grants;
create policy "course access grants: read own" on public.course_access_grants
  for select using (auth.uid() = user_id);

revoke all on table public.course_access_grants from anon, authenticated;
grant select on table public.course_access_grants to authenticated;

-- 3. The DSA waitlist ------------------------------------------------------------------------------
create table if not exists public.dsa_waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  -- the account, when the person was signed in or later signs up with this email
  user_id uuid references auth.users(id) on delete set null,
  -- where on the page they joined (dsa-soon, dsa-soon:footer, ...)
  source text not null default 'dsa-soon' check (source ~ '^[a-z0-9][a-z0-9:_-]{0,47}$'),
  -- a share handle from ?ref= (src/lib/share/handle.ts rules)
  ref text check (ref is null or ref ~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$'),
  -- optional interests from the form (src/lib/dsa/waitlist.ts GOALS / LANGUAGES)
  goals text[] not null default '{}' check (goals <@ array['interviews', 'fundamentals', 'competitive']::text[]),
  languages text[] not null default '{}' check (languages <@ array['python', 'java', 'cpp', 'javascript']::text[]),
  target_date date,
  cohort_hint text check (cohort_hint is null or length(cohort_hint) <= 80),
  -- joined while the dsa free window was open (set by the trigger below, never by the client)
  founding boolean not null default false,
  confirmation_sent_at timestamptz,
  -- the launch email went out
  notified_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dsa_waitlist_user_idx on public.dsa_waitlist (user_id) where user_id is not null;
create index if not exists dsa_waitlist_created_idx on public.dsa_waitlist (created_at desc);

-- 4. Founding helpers ------------------------------------------------------------------------------

-- Is the product's free window open right now?
create or replace function public.product_window_open(p_product text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.products p
    where p.id = p_product and (p.free_until is null or p.free_until > now())
  );
$$;

-- founding is decided by the database at insert time; updated_at follows every change
create or replace function public.dsa_waitlist_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.founding := public.product_window_open('dsa');
    new.created_at := now();
  else
    new.founding := old.founding;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dsa_waitlist_stamp on public.dsa_waitlist;
create trigger trg_dsa_waitlist_stamp
  before insert or update on public.dsa_waitlist
  for each row execute function public.dsa_waitlist_stamp();

-- Founding grants for every product whose window is open. Idempotent; returns how many were added.
create or replace function public.grant_founding_access(p_user uuid, p_source text default 'signup')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.course_access_grants (user_id, product, kind, source)
  select p_user, p.id, 'founding', left(coalesce(p_source, 'signup'), 64)
  from public.products p
  where p.free_until is null or p.free_until > now()
  on conflict (user_id, product, kind) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- New accounts: founding grants while the windows are open, the waitlist row linked to the account, and
-- both courses for an email that joined the DSA waitlist during DSA's window (even if the account comes
-- later). Never blocks a sign-up: any error is logged as a warning and the profile insert goes ahead.
create or replace function public.grant_founding_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  begin
    perform public.grant_founding_access(new.id, 'signup');

    select lower(u.email) into v_email from auth.users u where u.id = new.id;
    if v_email is not null then
      update public.dsa_waitlist w set user_id = new.id where w.email = v_email and w.user_id is null;

      if exists (select 1 from public.dsa_waitlist w where w.email = v_email and w.founding) then
        insert into public.course_access_grants (user_id, product, kind, source)
        select new.id, p.id, 'founding', 'waitlist'
        from public.products p
        where p.id in ('sdm', 'dsa')
        on conflict (user_id, product, kind) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'grant_founding_on_profile(%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_founding on public.user_profiles;
create trigger trg_user_profiles_founding
  after insert on public.user_profiles
  for each row execute function public.grant_founding_on_profile();

-- Launch-day backfill (run by hand, see the header): a founding grant for every existing account.
create or replace function public.backfill_founding_access(p_product text, p_source text default 'backfill')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.course_access_grants (user_id, product, kind, source)
  select up.id, p_product, 'founding', left(coalesce(p_source, 'backfill'), 64)
  from public.user_profiles up
  join auth.users u on u.id = up.id
  on conflict (user_id, product, kind) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Does this learner have the product? True for everyone while its paywall is off.
create or replace function public.has_access(p_user uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.products p where p.id = p_product and not p.paywall_on)
      or exists (
        select 1 from public.course_access_grants g
        where g.user_id = p_user
          and g.product = p_product
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at > now())
      );
$$;

-- Is this learner a founding member of the product?
create or replace function public.is_founding_member(p_user uuid, p_product text default 'dsa')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.course_access_grants g
    where g.user_id = p_user and g.product = p_product and g.kind = 'founding' and g.revoked_at is null
  );
$$;

-- The helpers take any user id, so they are for the server (service role) only.
revoke all on function public.product_window_open(text) from public, anon, authenticated;
revoke all on function public.dsa_waitlist_stamp() from public, anon, authenticated;
revoke all on function public.grant_founding_access(uuid, text) from public, anon, authenticated;
revoke all on function public.grant_founding_on_profile() from public, anon, authenticated;
revoke all on function public.backfill_founding_access(text, text) from public, anon, authenticated;
revoke all on function public.has_access(uuid, text) from public, anon, authenticated;
revoke all on function public.is_founding_member(uuid, text) from public, anon, authenticated;
grant execute on function public.product_window_open(text) to service_role;
grant execute on function public.grant_founding_access(uuid, text) to service_role;
grant execute on function public.backfill_founding_access(text, text) to service_role;
grant execute on function public.has_access(uuid, text) to service_role;
grant execute on function public.is_founding_member(uuid, text) to service_role;

-- 5. RLS on the waitlist ---------------------------------------------------------------------------
alter table public.dsa_waitlist enable row level security;

drop policy if exists "dsa waitlist: read own" on public.dsa_waitlist;
create policy "dsa waitlist: read own" on public.dsa_waitlist
  for select using (auth.uid() = user_id);

revoke all on table public.dsa_waitlist from anon, authenticated;
grant select on table public.dsa_waitlist to authenticated;
