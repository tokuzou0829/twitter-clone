CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_user_id" text NOT NULL,
	"actor_user_id" text,
	"type" varchar(32) NOT NULL,
	"post_id" text,
	"quote_post_id" text,
	"source_type" varchar(32) NOT NULL,
	"source_id" text NOT NULL,
	"title" text,
	"body" text,
	"action_url" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_quote_post_id_posts_id_fk" FOREIGN KEY ("quote_post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipientUserId_createdAt_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipientUserId_type_createdAt_idx" ON "notifications" USING btree ("recipient_user_id","type","created_at");--> statement-breakpoint
CREATE INDEX "notifications_postId_idx" ON "notifications" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "notifications_quotePostId_idx" ON "notifications" USING btree ("quote_post_id");--> statement-breakpoint
CREATE INDEX "notifications_actorUserId_idx" ON "notifications" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_sourceType_sourceId_idx" ON "notifications" USING btree ("source_type","source_id");--> statement-breakpoint
INSERT INTO "notifications" (
	"id",
	"recipient_user_id",
	"actor_user_id",
	"type",
	"source_type",
	"source_id",
	"action_url",
	"created_at"
)
SELECT
	'notification_follow_' || "f"."id" AS "id",
	"f"."following_id" AS "recipient_user_id",
	"f"."follower_id" AS "actor_user_id",
	'follow' AS "type",
	'follow' AS "source_type",
	"f"."id" AS "source_id",
	'/users/' || "f"."follower_id" AS "action_url",
	"f"."created_at" AS "created_at"
FROM "follows" AS "f"
WHERE "f"."follower_id" <> "f"."following_id"
ON CONFLICT ("source_type", "source_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" (
	"id",
	"recipient_user_id",
	"actor_user_id",
	"type",
	"post_id",
	"source_type",
	"source_id",
	"action_url",
	"created_at"
)
SELECT
	'notification_like_' || "l"."id" AS "id",
	"p"."author_id" AS "recipient_user_id",
	"l"."user_id" AS "actor_user_id",
	'like' AS "type",
	"l"."post_id" AS "post_id",
	'post_like' AS "source_type",
	"l"."id" AS "source_id",
	'/posts/' || "l"."post_id" AS "action_url",
	"l"."created_at" AS "created_at"
FROM "post_likes" AS "l"
INNER JOIN "posts" AS "p" ON "p"."id" = "l"."post_id"
WHERE "l"."user_id" <> "p"."author_id"
ON CONFLICT ("source_type", "source_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" (
	"id",
	"recipient_user_id",
	"actor_user_id",
	"type",
	"post_id",
	"source_type",
	"source_id",
	"action_url",
	"created_at"
)
SELECT
	'notification_repost_' || "r"."id" AS "id",
	"p"."author_id" AS "recipient_user_id",
	"r"."user_id" AS "actor_user_id",
	'repost' AS "type",
	"r"."post_id" AS "post_id",
	'post_repost' AS "source_type",
	"r"."id" AS "source_id",
	'/posts/' || "r"."post_id" AS "action_url",
	"r"."created_at" AS "created_at"
FROM "post_reposts" AS "r"
INNER JOIN "posts" AS "p" ON "p"."id" = "r"."post_id"
WHERE "r"."user_id" <> "p"."author_id"
ON CONFLICT ("source_type", "source_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "notifications" (
	"id",
	"recipient_user_id",
	"actor_user_id",
	"type",
	"post_id",
	"quote_post_id",
	"source_type",
	"source_id",
	"action_url",
	"created_at"
)
SELECT
	'notification_quote_' || "q"."id" AS "id",
	"target"."author_id" AS "recipient_user_id",
	"q"."author_id" AS "actor_user_id",
	'quote' AS "type",
	"target"."id" AS "post_id",
	"q"."id" AS "quote_post_id",
	'quote_post' AS "source_type",
	"q"."id" AS "source_id",
	'/posts/' || "q"."id" AS "action_url",
	"q"."created_at" AS "created_at"
FROM "posts" AS "q"
INNER JOIN "posts" AS "target" ON "target"."id" = "q"."quote_post_id"
WHERE "q"."quote_post_id" IS NOT NULL
	AND "q"."author_id" <> "target"."author_id"
ON CONFLICT ("source_type", "source_id") DO NOTHING;
