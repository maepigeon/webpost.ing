CREATE TABLE posts (
    "id" SERIAL PRIMARY KEY,
    "title" VARCHAR(255),
    "description" VARCHAR(16383),
    "published" BOOL NOT NULL,
    "date" TIMESTAMP NOT NULL DEFAULT NOW()
);

DROP TABLE posts;