CREATE TABLE posts (
    "id" SERIAL PRIMARY KEY,
    "title" VARCHAR(255),
    "description" VARCHAR(16383),
    "published" BOOL NOT NULL,
    "date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TABLE posts2;