CREATE TABLE "links" (
	"id" text PRIMARY KEY NOT NULL,
	"normalized_url" text NOT NULL,
	"host" varchar(255) NOT NULL,
	"display_url" varchar(1024) NOT NULL,
	"title" text,
	"description" text,
	"image_url" text,
	"site_name" varchar(255),
	"ogp_fetched_at" timestamp,
	"ogp_next_refresh_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_links" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"link_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_links" ADD CONSTRAINT "post_links_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_links" ADD CONSTRAINT "post_links_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "links_normalizedUrl_idx" ON "links" USING btree ("normalized_url");--> statement-breakpoint
CREATE INDEX "links_ogpNextRefreshAt_idx" ON "links" USING btree ("ogp_next_refresh_at");--> statement-breakpoint
CREATE INDEX "post_links_postId_idx" ON "post_links" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_links_linkId_idx" ON "post_links" USING btree ("link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_links_postId_position_idx" ON "post_links" USING btree ("post_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "post_links_postId_linkId_idx" ON "post_links" USING btree ("post_id","link_id");