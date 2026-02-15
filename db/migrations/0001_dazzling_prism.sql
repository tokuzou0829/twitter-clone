CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" varchar(255) NOT NULL,
	"key" varchar(1024) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"size" bigint NOT NULL,
	"expires_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
