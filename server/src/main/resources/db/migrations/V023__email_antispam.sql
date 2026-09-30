-- V023: Verify before storing, and cap how much mail one address can receive
--
-- Two abuse problems with the previous design:
--
--   1. Setting an address wrote it to users.email immediately, unverified. That
--      let anyone put someone else's address on their own account, and every
--      "resend confirmation" then mailed that person. The address is now held
--      only in email_tokens until the recipient proves they control it.
--
--   2. Notifications had no ceiling. A single busy thread could mail someone
--      dozens of times in an evening — indistinguishable from spam to them and
--      to their provider, which is how a sending domain gets blocked.
BEGIN;

-- Counts notification email per recipient per day. Transactional mail
-- (verification, password reset) is deliberately not counted: it is requested
-- by the recipient and must arrive.
CREATE TABLE IF NOT EXISTS email_send_log (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sent_on  DATE    NOT NULL,
    sent     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, sent_on)
);

-- Notifications that exceeded the daily cap, held for a digest rather than
-- dropped — the point is to send less mail, not to lose news.
CREATE TABLE IF NOT EXISTS email_digest_queue (
    id         SERIAL       PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary    VARCHAR(300) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_digest_user ON email_digest_queue(user_id, created_at);

-- Old counters are of no interest once the day has passed.
DELETE FROM email_send_log WHERE sent_on < CURRENT_DATE - 30;

COMMIT;
