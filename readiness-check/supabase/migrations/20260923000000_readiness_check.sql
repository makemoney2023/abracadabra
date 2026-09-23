alter type ops_status add value if not exists 'booked';

create type assessment_status as enum ('in_progress', 'completed', 'abandoned');
create type appointment_status as enum ('scheduled', 'rescheduled', 'cancelled', 'completed', 'no_show');

create table assessments (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  config_version text not null,
  status assessment_status not null default 'in_progress',
  lead_id uuid references leads (id) on delete set null,
  scan_id uuid references scans (id) on delete set null,
  domain text,
  email text,
  name text,
  answers jsonb not null default '{}'::jsonb,
  qualifiers jsonb not null default '{}'::jsonb,
  scores jsonb,
  utm jsonb not null default '{}'::jsonb,
  current_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  opted_in_at timestamptz
);

create table assessment_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references assessments (id) on delete set null,
  lead_id uuid not null references leads (id) on delete cascade,
  provider text not null,
  external_id text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status appointment_status not null default 'scheduled',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ops_queue add column assessment_id uuid references assessments (id) on delete set null;

create index assessments_domain_idx on assessments (domain);
create index assessments_lead_id_idx on assessments (lead_id);
create index assessment_events_assessment_id_idx on assessment_events (assessment_id);
create index appointments_lead_id_idx on appointments (lead_id);

alter table assessments enable row level security;
alter table assessment_events enable row level security;
alter table appointments enable row level security;

create policy "ops full assessments" on assessments for all using (is_ops()) with check (is_ops());
create policy "ops read assessment events" on assessment_events for select using (is_ops());
create policy "ops full appointments" on appointments for all using (is_ops()) with check (is_ops());

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger assessments_set_updated_at
before update on assessments
for each row execute function set_updated_at();

create trigger appointments_set_updated_at
before update on appointments
for each row execute function set_updated_at();
