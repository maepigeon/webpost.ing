-- V015: Email verification, notification preferences, and one-click unsubscribe
--
-- The whole feature is optional. With no SMTP configured the server never sends
-- anything, every column below simply stays at its default, and the app behaves
-- exactly as it did before.
BEGIN;

-- ── Address state on the user ────────────────────────────────────────────────
-- email already exists (V008). These record whether it has been proven to
-- belong to the account, which gates every send and the password-reset flow.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ DEFAULT NULL;

-- Secret used to authenticate one-click unsubscribe links, which by design work
-- without logging in. Per-user and rotatable, so revoking a leaked link does not
-- require changing the address.
ALTER TABLE users ADD COLUMN IF NOT EXISTS unsubscribe_token  VARCHAR(64) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unsubscribe_token
    ON users(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

-- ── Per-user notification preferences ────────────────────────────────────────
-- One row per user, created lazily on first read. Defaults are deliberately
-- conservative: opted in to the things a person asked for by following someone
-- or being messaged, opted out of receipts.
CREATE TABLE IF NOT EXISTS email_preferences (
    user_id            INTEGER     PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- Master switch. False silences every category regardless of the rest.
    enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
    on_direct_message  BOOLEAN     NOT NULL DEFAULT TRUE,
    on_new_follower    BOOLEAN     NOT NULL DEFAULT TRUE,
    on_followed_post   BOOLEAN     NOT NULL DEFAULT TRUE,
    on_post_published  BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Single-use tokens ────────────────────────────────────────────────────────
-- Backs address verification and password reset. Rows are kept after use so a
-- replayed link can be told apart from an invalid one, and expired rows are
-- pruned on write.
CREATE TABLE IF NOT EXISTS email_tokens (
    id          SERIAL       PRIMARY KEY,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Only the hash is stored. A leaked database must not hand over working
    -- password-reset links, exactly as with passwords themselves.
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,
    purpose     VARCHAR(32)  NOT NULL,
    -- The address the token was issued for, so changing the pending address
    -- invalidates a token in flight.
    email       VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ  DEFAULT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT email_tokens_purpose_known
        CHECK (purpose IN ('verify_email', 'password_reset'))
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user    ON email_tokens(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_email_tokens_expires ON email_tokens(expires_at);

COMMIT;
