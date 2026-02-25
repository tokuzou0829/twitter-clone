CREATE TABLE "post_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"mentioned_user_id" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_mentioned_user_id_user_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_mentions_postId_idx" ON "post_mentions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_mentions_mentionedUserId_idx" ON "post_mentions" USING btree ("mentioned_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_mentions_postId_position_idx" ON "post_mentions" USING btree ("post_id","position");