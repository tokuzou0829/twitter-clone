CREATE TABLE "ip_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"network" "cidr" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ip_bans_network_idx" ON "ip_bans" USING btree ("network");--> statement-breakpoint
CREATE INDEX "ip_bans_createdAt_idx" ON "ip_bans" USING btree ("created_at");