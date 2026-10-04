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

### One file as the base, from 2026-09-29

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
psql -U your_db_user -d your_database -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
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
| V002 | Wallpapers and page themes become tile grids: the columns become `text` and the old CSS patterns are cleared |
| V003 | Gives every post a stored, unique slug (`title`, `title-2`, ...) |
| V004 | `profile_grids` table (dropped again by V006) |
| V005 | `pixel_fonts` table: a user's own character sets for the grid editor |
| V006 | Drops `profile_grids`: grids on a profile are ordinary posts |
| V007 | `posts.votes_enabled`: existing posts keep voting, new posts start with it off |
| V008 | Fixes `post_views`: its primary key was deferrable, so recording a signed-in view failed every time; the key becomes ordinary and views are deleted with their user |
| V009 | `posts.page_theme`: each post keeps its own theme; existing posts get a copy of their author's current one |
| V010 | `posts.card_grid` (default true): whether a post's profile card previews its first grid |
| V011 | `users.banner_grid`: the owner's rows of the profile banner |
| V012 | `stickers` (a user's small grids) and `stickies` (stickers placed on a profile or post) |
| V013 | `shared_packs`: snapshots of sticker or symbol packs shared in messages |
| V014 | `shared_pack_saves`: who has saved each shared pack, so saving twice copies once |
| V017 | `posts.section` (`profile`, `notes` or `subscribers`, default `profile`): where a post belongs; drafts are just unpublished posts |
| V018 | `security_events` (user_id, kind, detail, shortened ip_prefix, user_agent, created_at): the member's own security log, pruned on write (200 rows, 90 days), cascades with the account |
| V019 | Performance indexes (published-post date order, unread notifications, per-user counts, username trigram, and more); drops two duplicate indexes. No data or columns change |
| V020 | `posts.card_preview`, `posts.search_text`, `posts.preview_version` (default 0) and a trigram index on `search_text` for published posts: what cards and search need, kept beside the body. Adds only; existing rows are filled afterwards by the server's background sweep (`PreviewSweep`), not by the migration |
| V021 | `user_identities` (user_id, provider, subject, email, email_verified, created_at, last_used_at): the Google or Microsoft account linked to a member, unique on (provider, subject) and on (user_id, provider), cascades with the account. Adds only; nothing in `users` changes |

V002 to V007 are already on the server. V008 to V014 go live with the next
release. Every one is in a transaction and safe to run again, except V007's
`ADD COLUMN` (no `IF NOT EXISTS`), which is fine because the runner never
re-applies a recorded version. Only V008 changes something that exists (a
key) and only V002 and V009 rewrite rows; the rest add.

---

## A fresh database

Create it, grant the app user rights on `public`, and start the server — it
applies V001 and builds everything. On PostgreSQL 15+ the grant is not
optional, or every table creation fails on permissions:

```bash
sudo -u postgres psql -c "CREATE DATABASE your_database OWNER your_db_user;"
sudo -u postgres psql -d your_database -c "GRANT ALL ON SCHEMA public TO your_db_user;"
```

## The test database

`./mvnw test` never uses the database `DB_NAME` points at. Starting a test
context runs this migration runner, and the tests write rows, so they get a
database of their own, `webposting_test`. Create it once, empty; the first
test run applies every migration to it:

```bash
createdb webposting_test
```

On a server, or wherever the app user cannot create databases:

```bash
sudo -u postgres psql -c "CREATE DATABASE webposting_test OWNER your_db_user;"
sudo -u postgres psql -d webposting_test -c "GRANT ALL ON SCHEMA public TO your_db_user;"
```

The connection comes from `server/src/test/resources/config/application.properties`,
which reads its own variables, never the `DB_*` ones:

| Variable | Default |
|---|---|
| `TEST_DB_HOST` | `localhost` |
| `TEST_DB_PORT` | `5432` |
| `TEST_DB_NAME` | `webposting_test` |
| `TEST_DB_USER` | your login name |
| `TEST_DB_PASSWORD` | *(empty)* |

`TestDatabaseGuard` stops a test context from starting when the database name
does not end in `_test`, or when it equals `DB_NAME`. It catches a
`SPRING_DATASOURCE_URL` in the environment, a `-Dspring.datasource.url`, or a
test's own `@TestPropertySource`. Sourcing `deploy.env` before a test run is
harmless.

To start over, drop and recreate it: `dropdb webposting_test && createdb webposting_test`.

## Schema validation test

`DatabaseSchemaTest.java` is a Spring integration test that asserts every expected table, column, and seed row exists in the test database after the migrations have run. Run it after adding a migration to confirm the chain builds the right schema:

```bash
cd server && ./mvnw test -Dtest=DatabaseSchemaTest
```

It checks:
- The core tables exist (the list is in the test; it does not yet cover the
  V009 to V014 additions)
- Critical columns on `users`, `posts`, `discussions`, `notifications`, `uploads`, `activity_deletions`
- The seeded roles in `role_limits` (`user`, `trusted`, `restricted`, `admin`,
  `frozen`)
- `frozen` has zero limits, `admin` has unlimited (-1)

---

## Backup before migrating

Always back up production before running migrations:
```bash
pg_dump -Fc your_database > backup_$(date +%Y%m%d_%H%M%S).dump

# Restore if needed:
pg_restore -d your_database backup_20260601_120000.dump
```
