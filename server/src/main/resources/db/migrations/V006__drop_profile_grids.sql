-- V006: grids on a profile are posts
--
-- V004 gave profiles their own list of grids. Grids on a profile are now
-- ordinary posts whose content is one grid, so they move, file into folders
-- and pin like any post; the separate table is no longer used.
BEGIN;

DROP TABLE IF EXISTS profile_grids;

COMMIT;
