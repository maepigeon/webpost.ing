# Database Migrations

## How it works

Migrations are numbered SQL files in `server/src/main/resources/db/migrations/`. Each file is named `V###__description.sql`. The server runs migrations automatically at startup via a custom `DatabaseMigrationService` that tracks applied versions in a `schema_migrations` table.

There is also a `config/migrations/` directory with the same files for reference and manual use via the `config/migrate.sh` script.

---

## Daily commands

**Check what's pending (no changes made):**
```bash
./config/migrate.sh --dry-run
```

**Show full migration history for this database:**
```bash
./config/migrate.sh --status
```

**Apply all pending migrations:**
```bash
./config/migrate.sh
```

**Connection defaults** (match `application.properties`):
```
DB_HOST=localhost  DB_PORT=5432  DB_NAME=testdb  DB_USER=mae
```

Override any of them inline:
```bash
DB_NAME=webpostingdb DB_USER=yourname PGPASSWORD=yourpass ./config/migrate.sh
```

---

## Adding a new migration

1. Create `config/migrations/V###__short_description.sql` — use the next version number.
2. Wrap the SQL in `BEGIN; ... COMMIT;`.
3. Make it idempotent: use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, etc.
4. Add a corresponding test in `DatabaseSchemaTest.java` asserting the new column/table/data exists.

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

| Scenario | Use |
|----------|-----|
| Brand new database | `psql -f config/database.sql` then `./config/migrate.sh` to register V001–V005 as applied |
| Existing database from v1 | `./config/migrate.sh` — runs V001 through V005 |
| Existing database already up to date | `./config/migrate.sh` — skips everything, no-op |

> **Note for fresh installs:** After running `database.sql`, the schema is already complete — but `schema_migrations` will be empty. Run `./config/migrate.sh` anyway so all versions get recorded and future migrations will skip correctly. (All the `IF NOT EXISTS` guards make it safe to run against the already-created schema.)

---

## Schema validation test

`DatabaseSchemaTest.java` is a Spring integration test that connects to the real database and asserts every expected table, column, and seed row exists. Run it after any migration to confirm the live schema is correct:

```bash
./mvnw test -pl server -Dtest=DatabaseSchemaTest
```

It checks:
- All 15 tables exist
- Critical columns on `users`, `posts`, `discussions`, `notifications`, `uploads`, `activity_deletions`
- All 6 roles in `role_limits` (`user`, `trusted`, `restricted`, `admin`, `frozen`, `audited`)
- `frozen` has zero limits, `admin` has unlimited (-1)

---

## Backup before migrating

Always back up production before running migrations:
```bash
pg_dump -Fc webpostingdb > backup_$(date +%Y%m%d_%H%M%S).dump

# Restore if needed:
pg_restore -d webpostingdb backup_20260601_120000.dump
```
