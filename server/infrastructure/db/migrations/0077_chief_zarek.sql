CREATE TABLE "app_version_policy" (
	"platform" varchar(20) PRIMARY KEY NOT NULL,
	"minimum_supported_build" integer DEFAULT 1 NOT NULL,
	"store_url" text NOT NULL,
	"blocker_title" text,
	"blocker_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "chat_settings" ALTER COLUMN "assistant_voice" SET DEFAULT 'shimmer';
--> statement-breakpoint
INSERT INTO "app_version_policy" ("platform", "minimum_supported_build", "store_url", "blocker_title", "blocker_message", "updated_by")
VALUES
  ('ios', 1, 'https://apps.apple.com/app/id6738029498', 'Обновите приложение', 'Доступна новая версия Mentala. Пожалуйста, обновите приложение для продолжения работы.', 'migration'),
  ('android', 1, 'https://play.google.com/store/apps/details?id=com.mentala.app', 'Обновите приложение', 'Доступна новая версия Mentala. Пожалуйста, обновите приложение для продолжения работы.', 'migration')
ON CONFLICT ("platform") DO NOTHING;