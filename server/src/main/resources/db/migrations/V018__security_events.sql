-- V018: a member's own security log
--
-- What happened on the account that the member would want to check if they
-- fear someone else got in: sign-ins, failed sign-ins, password and email
-- changes, "sign out everywhere". Shown in Settings > Security.
--
-- Privacy: the client address is stored SHORTENED, never whole: an IPv4
-- address with its last number set to 0 (203.0.113.0), an IPv6 address as its
-- /48 (2001:db8:1::/48). That is enough to recognise "that is not where I
-- was", not enough to follow a person around. The user agent is cut to 200
-- characters. Rows are pruned on write (newest 200 per user, nothing older
-- than 90 days) and go away with the account (ON DELETE CASCADE).
BEGIN;

CREATE TABLE IF NOT EXISTS security_events (
    id         BIGSERIAL PRIMARY KEY,
    user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       VARCHAR(32)  NOT NULL,
    detail     VARCHAR(200),
    ip_prefix  VARCHAR(64),
    user_agent VARCHAR(200),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_user_time
    ON security_events (user_id, created_at DESC);

COMMIT;
