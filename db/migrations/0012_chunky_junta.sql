CREATE TABLE "developer_notification_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"endpoint" varchar(2048) NOT NULL,
	"secret" varchar(256) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp,
	"last_status_code" integer,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_notification_webhooks" ADD CONSTRAINT "developer_notification_webhooks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_notification_webhooks_userId_idx" ON "developer_notification_webhooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "developer_notification_webhooks_createdAt_idx" ON "developer_notification_webhooks" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "developer_notification_webhooks_userId_endpoint_idx" ON "developer_notification_webhooks" USING btree ("user_id","endpoint");