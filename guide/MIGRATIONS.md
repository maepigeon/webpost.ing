# Database Migrations

## How it works

Migrations are numbered SQL files in `server/src/main/resources/db/migrations/`,
named `V###__description.sql`. **This directory is the single source of truth.**

`DatabaseMigrationService` runs at application startup, applies every pending
version in numeric order, and records it in the `schema_migrations` table with a
checksum. There is nothing to run by hand — deploying the JAR migrates the
database. Watch the log for:

```
Found 13 migration script(s) on classpath
Applying migration: V013__group_reactions_ownership
Database migration complete — applied: 1, skipped (already applied): 12
```

A file edited after it was applied is reported as a checksum mismatch at
startup, and not re-run.

### Dollar-quoted blocks

`DO $$ … $$` and `CREATE FUNCTION … $body$ … $body$` are supported. They need a
special path: Spring's `ScriptUtils` splits a script on `;` with a scanner that
does not understand dollar quoting, so it chops a PL/pgSQL body into fragments
that individually fail to parse. Scripts containing a dollar-quoted block are
therefore handed to the pgJDBC driver whole, since the driver's own statement
splitter *does* understand dollar quoting.

This previously failed in production and had to be worked around by hand-seeding
`schema_migrations` with V001–V007 so the runner would skip them. If you inherit
a database in that state, the versions are already recorded and will be skipped
normally.

> **Superseded scripts.** `config/migrate.sh` + `config/migrations/` and
> `tools/migrate.sh` + `tools/migrations/` are earlier generations of this idea.
> Production uses neither, and `config/migrations/` is *behind* the shipping
> files (V010 vs V013), so running it against a fresh database produces a schema
> the app rejects. See item 1 in [code-smells.txt](code-smells.txt).

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
-- V006__add_display_name.sql
BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(64) DEFAULT NULL;

COMMIT;
```

**Example — seeding new reference data:**
```sql
-- V007__new_role.sql
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
| V001 | Baseline migration from original v1 schema (adds all tables and columns up to 2024) |
| V002 | Add `frozen` and `audited` roles to `role_limits` |
| V003 | Add `pinned_post_id` column to `users` |
| V004 | Add `folder` column to `posts` |
| V005 | Scalability indexes (all `CREATE INDEX IF NOT EXISTS`) |
| V006 | Admin storage limit raised to 500 MB |
| V007 | Remove `audited` role |
| V008 | Direct messages, post views, invite codes, avatars, online heartbeat |
| V009 | Post upvote/downvote (`post_votes` table) |
| V010 | System settings table |
| V011 | DM reactions (`dm_reactions`), group conversations (`group_conversations`, `group_conversation_members`, `group_messages`, `group_message_read`), post sort order |
| V012 | Security and scalability indexes |
| V013 | Group message reactions (`group_message_reactions`), group ownership transfer support |

---

## Fresh install vs migration

| Scenario | What to do |
|---|---|
| Brand new database | Create an empty database, grant the app user rights on `public`, then start the server — it applies V001 onward and builds the whole schema. |
| Existing database, any version | Start the server. Applied versions are skipped. |
| Database whose `schema_migrations` was hand-seeded | Nothing special; those versions are recorded and skipped. |

`config/database.sql` is a snapshot of the schema for reference and for seeding
`role_limits`. It is **not** required — the migrations build the same schema — and
it lags behind them, so prefer letting the runner do it.

On PostgreSQL 15+ a fresh database needs the schema grant, or every migration
fails on permissions:

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
  `frozen`) — note `audited` was added by V002 and removed again by V007
- `frozen` has zero limits, `admin` has unlimited (-1)

---

## Backup before migrating

Always back up production before running migrations:
```bash
pg_dump -Fc webpostingdb > backup_$(date +%Y%m%d_%H%M%S).dump

# Restore if needed:
pg_restore -d webpostingdb backup_20260601_120000.dump
```
