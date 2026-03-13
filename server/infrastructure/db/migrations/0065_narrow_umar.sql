CREATE TABLE "telegram_alert_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"dedup_key" varchar(255) NOT NULL,
	"target_channel" varchar(20) NOT NULL,
	"environment" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"source" varchar(100),
	"payload" jsonb,
	"event_created_at" timestamp with time zone,
	"attempt" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"provider_response_code" integer,
	"provider_retry_after_seconds" integer,
	"telegram_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uk_telegram_alert_deliveries_dedup_key" UNIQUE("dedup_key")
);
--> statement-breakpoint
CREATE INDEX "idx_telegram_alert_deliveries_created_at" ON "telegram_alert_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_telegram_alert_deliveries_channel_status" ON "telegram_alert_deliveries" USING btree ("target_channel","status");--> statement-breakpoint
