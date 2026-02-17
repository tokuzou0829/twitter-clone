CREATE TABLE "developer_api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(32) NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_api_tokens" ADD CONSTRAINT "developer_api_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_api_tokens_userId_idx" ON "developer_api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "developer_api_tokens_expiresAt_idx" ON "developer_api_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_api_tokens_tokenHash_idx" ON "developer_api_tokens" USING btree ("token_hash");