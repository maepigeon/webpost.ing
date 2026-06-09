-- Migration 015: create dm_blocks table for per-user DM blocking
CREATE TABLE IF NOT EXISTS dm_blocks (
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT dm_blocks_blocker_fk FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT dm_blocks_blocked_fk FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
);
