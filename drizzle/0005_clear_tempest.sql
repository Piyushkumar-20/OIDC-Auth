-- Add user_id as nullable first so existing rows don't violate the constraint
ALTER TABLE "application" ADD COLUMN "user_id" uuid;

-- Remove any applications that pre-date ownership (they have no valid owner)
DELETE FROM "application" WHERE "user_id" IS NULL;

-- Now enforce NOT NULL going forward
ALTER TABLE "application" ALTER COLUMN "user_id" SET NOT NULL;
