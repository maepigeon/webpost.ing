SELECT * FROM users;

DROP TABLE users;

/* Create the users table, username must be unique */
CREATE TABLE users (
    "id" SERIAL PRIMARY KEY,
    "username" VARCHAR(32) NOT NULL,
  	"password" VARCHAR(32) NOT NULL,
    "registration_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  	UNIQUE ("username")
);

INSERT INTO users ("username", "password")
VALUES ('mae', 'meow');

INSERT INTO users ("username", "password")
VALUES ('strky', 'sexybunwolf');

SELECT "id", "username", "registration_date" FROM users;


SELECT * FROM posts;

/* Create the posts table
	Title: Post title
  Description: Post description
  Published: True if visible to other users
*/
CREATE TABLE posts (
    "id" SERIAL PRIMARY KEY,

    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1048575) NOT NULL,

    "published" BOOL NOT NULL,
    "date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
);

INSERT INTO posts (title, description, published) 
VALUES('title','description',true) RETURNING "id";

INSERT INTO posts ("title", "description", "published")
VALUES ('The post name', 'Meow meow meow meow', true) RETURNING "id";

ALTER TABLE posts 
ALTER COLUMN "description" TYPE VARCHAR(1048575);


DROP TABLE users_posts_junctions;

SELECT * FROM users_posts_junctions;


/* Stores the relation between users and posts (authorship) */
CREATE TABLE users_posts_junctions (
    "id" SERIAL PRIMARY KEY,
    "post_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
  	UNIQUE ("post_id", "user_id"),
    CONSTRAINT "posts_fk" FOREIGN KEY("post_id") REFERENCES "posts"("id"),
    CONSTRAINT "users_fk" FOREIGN KEY("user_id") REFERENCES "users"("id")
);

INSERT INTO users_posts_junctions ("post_id", "user_id")
VALUES (30, 1);

INSERT INTO users_posts_junctions ("post_id", "user_id")
VALUES (23, 2);

SELECT * FROM users_posts_junctions
WHERE "post_id" = 22;

SELECT * FROM users_posts_junctions
where "user_id" = 1;


/* Get posts from user by username*/
SELECT post.*
FROM posts post
INNER JOIN users_posts_junctions junction ON junction.post_id = post.id
INNER JOIN users selected_user ON selected_user.id = junction.user_id
WHERE selected_user.username = 'ketchup';

SELECT post.*
FROM posts post
INNER JOIN users_posts_junctions junction ON junction.post_id = post.id
INNER JOIN users "user" ON "user".id = junction.user_id
WHERE "user".username = 'invalid';

DELETE FROM users_posts_junctions WHERE post_id=99;


/* Get authors of post by post id */
SELECT selected_user.*
FROM users selected_user
INNER JOIN users_posts_junctions junction ON junction.user_id = selected_user.id
INNER JOIN posts post ON post.id = junction.post_id
WHERE post.id = 22;

SELECT userdata.*
from users userdata
WHERE userdata.username = 'ketchup' AND userdata.password = 'meow';