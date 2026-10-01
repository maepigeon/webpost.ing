-- V011: the profile banner is a tile grid
--
-- The top of a profile is drawn as a grid: four rows the site fills in (name,
-- follow counts, join date, public posts) beside the avatar, then rows the
-- owner draws. This holds the owner's rows, validated by GridValidator;
-- NULL until they make some.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_grid text;

COMMIT;
