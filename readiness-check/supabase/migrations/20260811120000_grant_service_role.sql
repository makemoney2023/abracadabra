-- Newer local Supabase does not auto-grant table privileges to API roles.
-- Service-role server routes need CRUD on app tables (RLS is still bypassed for service_role).

grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
