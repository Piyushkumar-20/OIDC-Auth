ALTER TABLE "user" ALTER COLUMN "password" SET DATA TYPE varchar(70);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "profile_image_url" text;