-- Runs once, when the database volume is first created. testdb (the
-- development database) is made by POSTGRES_DB; the server tests use this
-- second one and must never touch testdb.
CREATE DATABASE webposting_test;
