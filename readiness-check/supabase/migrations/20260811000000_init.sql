create extension if not exists "pgcrypto";

create type scan_source as enum ('public', 'ops');
create type scan_status as enum ('queued', 'running', 'complete', 'failed');
create type page_fetch_status as enum ('pending', 'ok', 'failed', 'unknown');
create type finding_severity as enum ('info', 'warn', 'critical');
create type ops_status as enum ('new', 'contacted', 'won', 'skipped');
create type staff_role as enum ('ops');

create table staff_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role staff_role not null default 'ops',
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  domain text not null unique,
  website text,
  industry text,
  source text not null default 'findall',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  name text,
  title text,
  email text,
  phone text,
  confidence numeric,
  created_at timestamptz not null default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  origin text not null,
  source scan_source not null,
  status scan_status not null default 'queued',
  public_token text not null unique,
  lead_id uuid references leads (id) on delete set null,
  score_total integer,
  score_breakdown jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index scans_domain_created_idx on scans (domain, created_at desc);

create table scan_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans (id) on delete cascade,
  url text not null,
  page_type text not null default 'other',
  fetch_status page_fetch_status not null default 'pending',
  has_json_ld boolean not null default false,
  schema_types text[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb
);

create table scan_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans (id) on delete cascade,
  page_id uuid references scan_pages (id) on delete set null,
  code text not null,
  severity finding_severity not null,
  passed boolean not null,
  message text not null,
  evidence jsonb not null default '{}'::jsonb
);

create table scan_unlocks (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (scan_id, email)
);

create table ops_queue (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads (id) on delete cascade,
  latest_scan_id uuid references scans (id) on delete set null,
  status ops_status not null default 'new',
  priority_score numeric not null default 0,
  missing_contact boolean not null default false,
  notes text,
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table ops_status_audit (
  id uuid primary key default gen_random_uuid(),
  ops_queue_id uuid not null references ops_queue (id) on delete cascade,
  from_status ops_status,
  to_status ops_status not null,
  changed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index scan_pages_scan_id_idx on scan_pages (scan_id);
create index scan_findings_scan_id_idx on scan_findings (scan_id);
create index scan_unlocks_scan_id_idx on scan_unlocks (scan_id);
create index contacts_lead_id_idx on contacts (lead_id);
create index ops_queue_status_idx on ops_queue (status);

alter table staff_profiles enable row level security;
alter table leads enable row level security;
alter table contacts enable row level security;
alter table scans enable row level security;
alter table scan_pages enable row level security;
alter table scan_findings enable row level security;
alter table scan_unlocks enable row level security;
alter table ops_queue enable row level security;
alter table ops_status_audit enable row level security;

create or replace function is_ops() returns boolean
language sql stable as $$
  select exists (
    select 1 from staff_profiles sp
    where sp.user_id = auth.uid() and sp.role = 'ops'
  );
$$;

-- Service role bypasses RLS; anon/authenticated policies:
create policy "ops full leads" on leads for all using (is_ops()) with check (is_ops());
create policy "ops full contacts" on contacts for all using (is_ops()) with check (is_ops());
create policy "ops full scans" on scans for all using (is_ops()) with check (is_ops());
create policy "ops full pages" on scan_pages for all using (is_ops()) with check (is_ops());
create policy "ops full findings" on scan_findings for all using (is_ops()) with check (is_ops());
create policy "ops full unlocks" on scan_unlocks for all using (is_ops()) with check (is_ops());
create policy "ops full queue" on ops_queue for all using (is_ops()) with check (is_ops());
-- ops_status_audit INSERTs have no RLS write policy; use the service-role admin client.
create policy "ops read audit" on ops_status_audit for select using (is_ops());
create policy "ops read self profile" on staff_profiles for select using (auth.uid() = user_id);
