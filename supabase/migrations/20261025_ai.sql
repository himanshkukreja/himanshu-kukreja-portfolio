-- AI features: one settings row (the switch, budget, cycle, per-feature model and limits), a log of every
-- AI call (who, feature, model, tokens, cost, credits, latency, status) and a block list. Server-only:
-- RLS on with no policies, so only the service role reads or writes. See src/lib/ai/.

create table if not exists public.ai_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  -- the credit cycle: the month runs from this day of the month (1-28)
  cycle_day int not null default 13 check (cycle_day between 1 and 28),
  monthly_budget_usd numeric(10, 2) not null default 450,
  -- live calls may use this share of the month; the rest is kept for batch content jobs
  live_share numeric(4, 3) not null default 0.7 check (live_share between 0 and 1),
  -- per-user ceiling and floor for the daily allowance, in USD
  user_daily_max_usd numeric(10, 4) not null default 0.5,
  user_daily_min_usd numeric(10, 4) not null default 0.01,
  -- after this date AI switches itself off (the credits' end)
  ends_on date,
  -- { "<feature>": { "enabled": bool, "model": "<id>", "perDay": int } }
  features jsonb not null default '{}'::jsonb,
  note text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_calls (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  credits int not null default 0,
  latency_ms int,
  -- ok | error | blocked | rate_limited | over_quota | disabled
  status text not null default 'ok',
  error text,
  request_id text,
  batch boolean not null default false,
  -- small context only (lesson, lab, mock id); never the learner's text
  meta jsonb not null default '{}'::jsonb
);
create index if not exists ai_calls_created_idx on public.ai_calls (created_at desc);
create index if not exists ai_calls_user_idx on public.ai_calls (user_id, created_at desc);
create index if not exists ai_calls_feature_idx on public.ai_calls (feature, created_at desc);

create table if not exists public.ai_blocks (
  user_id uuid primary key,
  reason text,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.ai_settings enable row level security;
alter table public.ai_calls enable row level security;
alter table public.ai_blocks enable row level security;

-- spend in a window: all calls, live features only (p_live true: not eval/batch) or content jobs only
-- (false), optionally one user. The governor's hot path: one indexed range scan.
create or replace function public.ai_spend_v2(p_from timestamptz, p_live boolean default null, p_user uuid default null)
returns table (cost numeric, calls bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0), count(*)
  from ai_calls
  where created_at >= p_from
    and status = 'ok'
    and (p_user is null or user_id = p_user)
    and (p_live is null or (p_live = (feature not in ('eval', 'batch'))));
$$;
revoke all on function public.ai_spend_v2(timestamptz, boolean, uuid) from public, anon, authenticated;

-- learners who used AI since p_from (the governor shares today's budget across them)
create or replace function public.ai_active_users(p_from timestamptz)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(distinct user_id) from ai_calls where created_at >= p_from and user_id is not null;
$$;
revoke all on function public.ai_active_users(timestamptz) from public, anon, authenticated;

-- admin dashboard: everything for a window in one round trip (by feature, model, status, day, user)
create or replace function public.ai_dashboard(p_from timestamptz, p_today timestamptz)
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with c as (select * from public.ai_calls where created_at >= p_from)
  select jsonb_build_object(
    'byFeature', (select coalesce(jsonb_agg(x order by x.cost desc), '[]'::jsonb) from (
      select feature, count(*) filter (where status = 'ok') as calls, count(*) filter (where status <> 'ok') as refused,
             coalesce(sum(cost_usd), 0) as cost, coalesce(sum(credits), 0) as credits,
             coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output, coalesce(sum(cache_read_tokens), 0) as cache_read,
             round(avg(latency_ms) filter (where status = 'ok')) as latency
      from c group by feature) x),
    'byModel', (select coalesce(jsonb_agg(x order by x.cost desc), '[]'::jsonb) from (
      select model, count(*) filter (where status = 'ok') as calls, coalesce(sum(cost_usd), 0) as cost,
             coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output
      from c group by model) x),
    'byStatus', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) as n from c group by status) x),
    'daily', (select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) from (
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
             coalesce(sum(cost_usd) filter (where feature not in ('eval', 'batch')), 0) as live,
             coalesce(sum(cost_usd) filter (where feature in ('eval', 'batch')), 0) as content,
             count(*) filter (where status = 'ok') as calls
      from c group by 1) x),
    'users', (select coalesce(jsonb_agg(x order by x.cost desc), '[]'::jsonb) from (
      select c.user_id, u.email,
             count(*) filter (where c.status = 'ok') as calls, count(*) filter (where c.status <> 'ok') as refused,
             coalesce(sum(c.cost_usd), 0) as cost, coalesce(sum(c.credits), 0) as credits,
             coalesce(sum(c.cost_usd) filter (where c.created_at >= p_today), 0) as today,
             max(c.created_at) as last_at,
             exists (select 1 from public.ai_blocks b where b.user_id = c.user_id) as blocked
      from c left join auth.users u on u.id = c.user_id
      where c.user_id is not null
      group by c.user_id, u.email
      limit 200) x)
  );
$$;
revoke all on function public.ai_dashboard(timestamptz, timestamptz) from public, anon, authenticated;

-- admin call log, newest first, with the learner's email
create or replace function public.ai_calls_page(p_feature text, p_status text, p_user uuid, p_email text, p_limit int, p_offset int)
returns table (id bigint, created_at timestamptz, user_id uuid, email text, feature text, model text, input_tokens int, output_tokens int,
               cache_read_tokens int, cost_usd numeric, credits int, latency_ms int, status text, error text, request_id text, meta jsonb, total bigint)
language sql stable security definer set search_path = public, auth as $$
  select c.id, c.created_at, c.user_id, u.email::text, c.feature, c.model, c.input_tokens, c.output_tokens, c.cache_read_tokens, c.cost_usd,
         c.credits, c.latency_ms, c.status, c.error, c.request_id, c.meta, count(*) over () as total
  from public.ai_calls c left join auth.users u on u.id = c.user_id
  where (p_feature is null or c.feature = p_feature)
    and (p_status is null or c.status = p_status)
    and (p_user is null or c.user_id = p_user)
    and (p_email is null or u.email ilike '%' || p_email || '%')
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;
revoke all on function public.ai_calls_page(text, text, uuid, text, int, int) from public, anon, authenticated;

-- bring-your-own-key calls: logged like any call but paid by the learner, so the budget ignores them
alter table public.ai_calls add column if not exists byok boolean not null default false;
create or replace function public.ai_spend_v2(p_from timestamptz, p_live boolean default null, p_user uuid default null)
returns table (cost numeric, calls bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0), count(*)
  from ai_calls
  where created_at >= p_from
    and status = 'ok'
    and not byok
    and (p_user is null or user_id = p_user)
    and (p_live is null or (p_live = (feature not in ('eval', 'batch'))));
$$;
create or replace function public.ai_active_users(p_from timestamptz)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(distinct user_id) from ai_calls where created_at >= p_from and user_id is not null and not byok;
$$;
