# Migration System Notes

## What exists

- `config/database.sql` — full fresh-install schema (all tables, indexes, role_limits seed)
- `config/migrations/V001–V005` — numbered idempotent SQL migration files
- `config/migrate.sh` — shell script that applies pending migrations, tracks versions in `schema_migrations` table
- `server/src/test/java/.../DatabaseSchemaTest.java` — Spring integration test that validates live schema
- `guide/MIGRATIONS.md` — user-facing documentation for the migration system

## Known state (2026-06-09)

The live database on this machine was behind: missing `pinned_post_id` on users, `folder` on posts, and the `frozen`/`audited` role_limits rows. All fixed by running `migrate.sh` which applied V001–V005.

## Important: fresh install registration

After `psql -f database.sql`, the schema is complete but `schema_migrations` is empty. Run `./config/migrate.sh` afterward so all 5 versions get recorded — otherwise the next migration will try to re-run V001–V005 (they're idempotent so it's safe, just noisy).

## Adding future migrations

1. Create `config/migrations/V006__description.sql` (next number)
2. Wrap in BEGIN/COMMIT, use IF NOT EXISTS
3. Add assertions to `DatabaseSchemaTest.java`
4. Update the table in `guide/MIGRATIONS.md`

## Test counts (as of 2026-06-09)

184 total tests:
- 33 PatternValidatorTest
- 32 DiscussionControllerTest
- 32 SocialFollowsMessagesTest
- 28 AuthControllerTest
- 22 AdminControllerTest
- 10 DatabaseSchemaTest (integration — hits real DB)
- 9  PostAuthorizationTest
- 6  SocialControllerTest
- 6  UploadControllerTest
- 5  PostControllerTest
- 1  RestServicePostApplicationTests (context load — hits real DB)
