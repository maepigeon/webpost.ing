# Database Migrations

## How it works

Migrations are numbered SQL files in `server/src/main/resources/db/migrations/`,
named `V###__description.sql`. **This directory is the single source of truth.**

`DatabaseMigrationService` runs at application startup, applies every pending
version in numeric order, and records it in the `schema_migrations` table with a
checksum. There is nothing to run by hand — deploying the JAR migrates the
database. Watch the log for:

```
Found 1 migration script(s) on classpath
Database migration complete — applied: 0, skipped (already applied): 1
```

A file edited after it was applied is reported as a checksum mismatch at
startup, and not re-run.

### One file, from 2026-09-29

The history was squashed into `V001__schema.sql`: the complete schema plus
its seed rows (`role_limits`, `system_settings`). It replaced the old V001–V024,
`config/database.sql`, the v1 import script and the shell migration tools,
all of which are gone. The file is a `pg_dump --schema-only` of a database
built from the old chain, and was checked column for column, index for
index and constraint for constraint against it.

A database built from the old chain has recorded V001–V024 and would try to
apply the new V001 on top of itself. Move it across with:

```bash
./tools/reset-schema.sh --dry-run   # see the plan
./tools/reset-schema.sh             # stop the app first
```

It backs up, builds a fresh database from the schema, copies every row
across (columns both sides share), resets the ID sequences, records
`V001__schema`, and swaps the two by renaming. The old database is kept as
`<name>_before_reset_<timestamp>` until you drop it. On a server, run it
with `ADMIN_PSQL="sudo -u postgres psql"`: creating and renaming databases
and loading rows past foreign keys need a superuser.

### Dollar-quoted blocks

`DO $$ … $$` and `CREATE FUNCTION … $body$ … $body$` are supported. Spring's
`ScriptUtils` splits a script on `;` with a scanner that does not understand
dollar quoting, so scripts containing a dollar-quoted block are handed to the
pgJDBC driver whole; the driver's own splitter does understand it.

---

## Daily commands

**Apply pending migrations:** start the server. That is the whole procedure.

**See what has been applied:**
```bash
psql -U mae -d webpostingdb -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
```

**See what is pending:** compare that against the files on disk.
```bash
ls server/src/main/resources/db/migrations/
```

Connection settings come from `deploy.env` — see
[CONFIGURATION.md](CONFIGURATION.md).

## Adding a new migration

1. Create `server/src/main/resources/db/migrations/V###__short_description.sql`
   with the next version number.
2. Wrap the SQL in `BEGIN; ... COMMIT;`.
3. Make it idempotent: `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `ON CONFLICT DO NOTHING`. The runner will not re-apply a recorded version,
   but idempotence makes a partially-applied migration safe to retry.
4. Add an assertion to `DatabaseSchemaTest.java` for the new column/table/row.
5. Add a row to the history table below.
6. Never edit a migration that has already been applied anywhere — the checksum
   check will flag it. Write a new version instead.

**Example — adding a new column:**
```sql
-- V002__add_display_name.sql
BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(64) DEFAULT NULL;

COMMIT;
```

**Example — seeding new reference data:**
```sql
-- V003__new_role.sql
BEGIN;

INSERT INTO role_limits (role, max_storage_bytes, max_posts_per_day)
VALUES ('premium', 1073741824, 200)
ON CONFLICT (role) DO NOTHING;

COMMIT;
```

---

## Current migration history

| Version | Description |
|---------|-------------|
| V001 | The complete schema and seed data (squashed 2026-09-29) |

---

## A fresh database

Create it, grant the app user rights on `public`, and start the server — it
applies V001 and builds everything. On PostgreSQL 15+ the grant is not
optional, or every table creation fails on permissions:

```bash
sudo -u postgres psql -c "CREATE DATABASE webpostingdb OWNER mae;"
sudo -u postgres psql -d webpostingdb -c "GRANT ALL ON SCHEMA public TO mae;"
```

## Schema validation test

`DatabaseSchemaTest.java` is a Spring integration test that connects to the real database and asserts every expected table, column, and seed row exists. Run it after any migration to confirm the live schema is correct:

```bash
cd server && set -a && . ../deploy.env && set +a && ./mvnw test -Dtest=DatabaseSchemaTest
```

It checks:
- All 15 tables exist
- Critical columns on `users`, `posts`, `discussions`, `notifications`, `uploads`, `activity_deletions`
- The seeded roles in `role_limits` (`user`, `trusted`, `restricted`, `admin`,
  `frozen`)
- `frozen` has zero limits, `admin` has unlimited (-1)

---

## Backup before migrating

Always back up production before running migrations:
```bash
pg_dump -Fc webpostingdb > backup_$(date +%Y%m%d_%H%M%S).dump

# Restore if needed:
pg_restore -d webpostingdb backup_20260601_120000.dump
```
