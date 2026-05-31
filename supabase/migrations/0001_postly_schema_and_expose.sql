-- Postly lives in its own `postly` schema (never public) so it cannot touch
-- the live ordering app sharing this Supabase project. This migration creates
-- the schema, grants access, and exposes it through PostgREST.

create schema if not exists postly;

grant usage on schema postly to anon, authenticated, service_role;
grant all on all tables in schema postly to anon, authenticated, service_role;
grant all on all routines in schema postly to anon, authenticated, service_role;
grant all on all sequences in schema postly to anon, authenticated, service_role;
alter default privileges in schema postly grant all on tables to anon, authenticated, service_role;
alter default privileges in schema postly grant all on routines to anon, authenticated, service_role;
alter default privileges in schema postly grant all on sequences to anon, authenticated, service_role;

-- Expose the postly schema via PostgREST, preserving existing public + graphql_public
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, postly';
notify pgrst, 'reload config';
