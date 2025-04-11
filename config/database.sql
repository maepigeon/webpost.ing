CREATE TABLE posts (
    "id" SERIAL PRIMARY KEY,

    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(16383) NOT NULL,

    "published" BOOL NOT NULL,
    "date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
);

CREATE TABLE users (
    "id" SERIAL PRIMARY KEY,

    "username" VARCHAR(32) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(64),
    "bio" VARCHAR(512),

    "registration_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE users_posts_junction (
    "id" SERIAL PRIMARY KEY,
    "post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    CONSTRAINT "posts_fk" FOREIGN KEY("post_id") REFERENCES "posts"("id").
    CONSTRAINT "users_fk" FOREIGN KEY("user_id") REFERENCES "users"("id")
);