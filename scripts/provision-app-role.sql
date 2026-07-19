-- Creates the non-privileged role the application connects as.
--
-- Row-level security does not apply to superusers, so the app must NOT
-- connect as the database owner. Run this once per environment as the
-- owner/admin user, then point DATABASE_URL at salonos_app (keep DIRECT_URL
-- on the owner for migrations). Change the password outside development.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'salonos_app') THEN
    CREATE ROLE salonos_app LOGIN PASSWORD 'salonos_app_dev_pw';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE amara TO salonos_app;
GRANT USAGE ON SCHEMA public TO salonos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO salonos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO salonos_app;

-- Tables created by future migrations get the same grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO salonos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO salonos_app;
