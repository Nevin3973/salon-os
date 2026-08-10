-- Creates the non-privileged role the application connects as.
--
-- Row-level security does not apply to superusers, and on a managed host the
-- admin role (Neon's neondb_owner, DigitalOcean's doadmin) has BYPASSRLS. The
-- app must therefore NOT connect as that role: point DATABASE_URL at
-- salonos_app and keep DIRECT_URL on the admin, which migrations and backups
-- need in order to read past RLS.
--
-- Pure SQL on purpose. This file is applied both by psql and by
-- `prisma db execute` (in CI), and the latter sends raw SQL to the server —
-- psql meta-commands like \set, \if and \gexec are a syntax error there. An
-- earlier version used them and broke the CI database step while working fine
-- locally, which is the most annoying way for a script to fail.
--
-- The role is created with the development password. Anywhere reachable,
-- rotate it immediately afterwards with a generated one:
--
--   psql "$URL" -c "ALTER ROLE salonos_app PASSWORD '$(openssl rand -base64 24)'"

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'salonos_app') THEN
    CREATE ROLE salonos_app LOGIN PASSWORD 'salonos_app_dev_pw';
  END IF;
END
$$;

-- The database is called `salonos` locally, `neondb` on Neon and `defaultdb` on
-- DigitalOcean, so the CONNECT grant is issued against current_database().
-- Naming one made this script fail on every host but the one it was written for.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO salonos_app', current_database());
END
$$;

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
