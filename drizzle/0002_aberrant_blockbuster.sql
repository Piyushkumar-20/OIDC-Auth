CREATE TABLE "application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"application_url" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_client_id_unique" UNIQUE("client_id")
);
