-- OPTIONAL (not applied): indexes for the v2 traffic report on analytics_events.
-- The report pages through a time window (created_at), filters by event_type, and looks up
-- visitors / sessions for "new vs returning" and "exclude my visits". Safe to run any time;
-- CONCURRENTLY avoids locking writes (run each statement on its own, outside a transaction).

create index concurrently if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at);

create index concurrently if not exists analytics_events_event_type_created_at_idx
  on public.analytics_events (event_type, created_at);

create index concurrently if not exists analytics_events_session_id_idx
  on public.analytics_events (session_id);

create index concurrently if not exists analytics_events_visitor_id_idx
  on public.analytics_events (visitor_id);

-- "exclude my visits" looks up every visitor id a signed-in admin has used.
create index concurrently if not exists analytics_events_user_id_idx
  on public.analytics_events (user_id) where user_id is not null;

-- (visitor_id, created_at) serves the "seen before this window?" lookups once the table is large.
create index concurrently if not exists analytics_events_visitor_created_idx
  on public.analytics_events (visitor_id, created_at);
