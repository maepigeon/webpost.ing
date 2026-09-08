-- V016: Post reports
--
-- Readers flag a post; the report lands in a queue in the admin dashboard.
BEGIN;

CREATE TABLE IF NOT EXISTS post_reports (
    id           SERIAL       PRIMARY KEY,
    post_id      INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    -- Nullable so a report survives the reporter deleting their account: the
    -- report is still worth acting on, it just becomes anonymous.
    reporter_id  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    reason       VARCHAR(32)  NOT NULL,
    details      VARCHAR(1000) DEFAULT NULL,
    status       VARCHAR(16)  NOT NULL DEFAULT 'open',
    resolved_by  VARCHAR(32)  DEFAULT NULL,
    resolved_at  TIMESTAMPTZ  DEFAULT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT post_reports_status_known CHECK (status IN ('open', 'resolved', 'dismissed'))
);

-- One report per person per post. Re-reporting is not more signal, and without
-- this a single user could flood the queue.
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_reports_unique_reporter
    ON post_reports(post_id, reporter_id) WHERE reporter_id IS NOT NULL;

-- The dashboard reads open reports newest first.
CREATE INDEX IF NOT EXISTS idx_post_reports_status ON post_reports(status, created_at DESC);

COMMIT;
