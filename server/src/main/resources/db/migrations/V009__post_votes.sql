-- V009: Post upvote / downvote table
BEGIN;

CREATE TABLE IF NOT EXISTS post_votes (
    post_id  INTEGER  NOT NULL,
    user_id  INTEGER  NOT NULL,
    vote     SMALLINT NOT NULL,
    PRIMARY KEY (post_id, user_id),
    CONSTRAINT post_votes_vote_check  CHECK (vote = ANY (ARRAY[1, -1])),
    CONSTRAINT post_votes_post_fk     FOREIGN KEY (post_id) REFERENCES posts(id)  ON DELETE CASCADE,
    CONSTRAINT post_votes_user_fk     FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

COMMIT;
