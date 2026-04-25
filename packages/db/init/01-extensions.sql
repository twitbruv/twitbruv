-- Required by the schema (citext columns for handles/tags/emails).
-- Runs automatically when the postgres container starts on an empty volume.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pg_trgm backs the GIN trigram indexes on users.handle / users.email so admin + public
-- search can do `ilike '%foo%'` without a sequential scan once the tables grow.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
