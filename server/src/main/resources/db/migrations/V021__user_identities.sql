-- V021: sign-in with Google, Microsoft (and later Apple)
--
-- One row per provider account linked to a member. A person is recognised by
-- (provider, subject), the provider's own stable id for them, and NEVER by
-- email: the address is kept only to show "linked as a@b.c" in Settings.
-- No tokens of any kind are stored.
--
-- A member has at most one account per provider, so "unlink Google" names
-- exactly one row. Rows go away with the account (ON DELETE CASCADE).
--
-- Nothing changes in `users`. An account made through a provider has no
-- password yet; that is recorded as a value in users.password that is not a
-- bcrypt hash (see SsoAccounts.NO_PASSWORD), so every existing path that sets
-- a password (change, reset by email, admin) turns it into an ordinary account
-- without knowing about this table.
BEGIN;

CREATE TABLE IF NOT EXISTS user_identities (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       VARCHAR(16)  NOT NULL,
    subject        VARCHAR(255) NOT NULL,
    email          VARCHAR(255),
    email_verified BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_used_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider_subject
    ON user_identities (provider, subject);

CREATE UNIQUE INDEX IF NOT EXISTS user_identities_user_provider
    ON user_identities (user_id, provider);

COMMIT;
