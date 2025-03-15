CREATE TABLE posts (
    "id" SERIAL PRIMARY KEY,
    "title" VARCHAR(255),
    "description" VARCHAR(255),
    "published" BOOL NOT NULL
);