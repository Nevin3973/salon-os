-- Creates the non-privileged role the application connects as.
--
-- Row-level security does not apply to superusers, so the app must NOT connect
-- as the database owner. Run this once per environment as the owner/admin user,
-- then point DATABASE_URL at salonos_app (keep DIRECT_URL on the owner, which
-- migrations and backups need in order to read past RLS).
--
-- Portable across hosts on purpose: the database is called `salonos` locally,
-- `neondb` on Neon and `defaultdb` on DigitalOcean, so the CONNECT grant is
-- issued against current_database() rather than a hardcoded name — naming one
-- made this script fail on every host but the one it was written for.
--
-- The password comes from the `app_role_password` setting when one is given,
-- so production never has to use the development default:
--
--   psql "$URL" -v app_role_password="$(openssl rand -base64 24)" \
--        -f scripts/provision-app-role.sql
--
-- Run without -v and it falls back to the development password, which is fine
-- for local Docker and must never be used anywhere reachable.

\if :{?app_role_password}
\else
  \set app_role_password 'salonos_app_dev_pw'
\endif

SELECT format(
  'CREATE ROLE salonos_app LOGIN PASSWORD %L',
  :'app_role_password'
) AS stmt
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'salonos_app')
\gexec

-- Re-running with a new password rotates it rather than failing.
SELECT format(
  'ALTER ROLE salonos_app PASSWORD %L',
  :'app_role_password'
) AS stmt
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = 'salonos_app')
\gexec

-- current_database() keeps this working whatever the host calls the database.
SELECT format('GRANT CONNECT ON DATABASE %I TO salonos_app', current_database()) AS stmt
\gexec

GRANT USAGE ON SCHEMA public TO salonos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO salonos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO salonos_app;

-- Tables created by future migrations get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO salonos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO salonos_app;

-- Belt and braces: this role must never be able to step over row-level
-- security, whatever it may have been granted previously.
ALTER ROLE salonos_app NOBYPASSRLS;
