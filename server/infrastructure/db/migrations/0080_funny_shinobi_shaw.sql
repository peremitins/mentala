ALTER TABLE "user_devices" ADD COLUMN "channel_type" varchar(20) DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_devices" ADD COLUMN "platform_family" varchar(20);--> statement-breakpoint
ALTER TABLE "user_devices" ADD COLUMN "installation_id" varchar(255);--> statement-breakpoint
ALTER TABLE "user_devices" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_devices" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;