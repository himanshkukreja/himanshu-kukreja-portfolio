-- Contact queries table
create table contact_queries (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null,
  message text not null,
  ip text,
  created_at timestamptz default now(),
  status text default 'new' check (status in ('new', 'replied', 'resolved')),
  admin_notes text
);

-- Index for faster queries
create index contact_queries_created_at_idx on contact_queries (created_at desc);
create index contact_queries_status_idx on contact_queries (status);
