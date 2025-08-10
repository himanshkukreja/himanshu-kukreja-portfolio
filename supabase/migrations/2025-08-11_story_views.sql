-- Story views tracking tables and RPC for atomic increments

create table if not exists public.story_views (
  story_id text primary key,
  total_views integer not null default 0,
  unique_views integer not null default 0,
  last_viewed_at timestamptz
);

create table if not exists public.story_unique_visitors (
  story_id text not null,
  visitor_id text not null,
  first_viewed_at timestamptz not null default now(),
  primary key (story_id, visitor_id)
);

-- Helpful indexes
create index if not exists idx_story_unique_visitors_story on public.story_unique_visitors (story_id);
create index if not exists idx_story_unique_visitors_first_viewed_at on public.story_unique_visitors (first_viewed_at desc);

-- RPC to atomically track a view and return updated counts
create or replace function public.track_story_view(
  p_story_id text,
  p_visitor_id text
)
returns table (
  total_views integer,
  unique_views integer,
  is_unique boolean
)
language plpgsql
as $$
declare
  v_inserted boolean := false;
begin
  -- Always increment total views
  insert into public.story_views (story_id, total_views, unique_views, last_viewed_at)
  values (p_story_id, 1, 0, now())
  on conflict (story_id) do update
    set total_views = public.story_views.total_views + 1,
        last_viewed_at = now();

  -- Try to record a unique visitor (first time only)
  begin
    insert into public.story_unique_visitors (story_id, visitor_id)
    values (p_story_id, p_visitor_id);
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false;
  end;

  if v_inserted then
    update public.story_views
      set unique_views = unique_views + 1,
          last_viewed_at = now()
      where story_id = p_story_id;
  end if;

  return query
  select sv.total_views, sv.unique_views, v_inserted as is_unique
  from public.story_views sv
  where sv.story_id = p_story_id;
end;
$$;

-- Grant execute to anon/authenticated if using RLS-less service-only access through server
-- Adjust according to your security model
grant execute on function public.track_story_view(text, text) to anon, authenticated, service_role;
