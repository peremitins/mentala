CREATE TABLE "roles" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Insert default roles before adding foreign key constraint
INSERT INTO "roles" ("id", "name", "description", "is_system") VALUES
	('admin', 'Администратор', 'Полный доступ ко всем ресурсам системы', true),
	('user', 'Пользователь', 'Обычный пользователь приложения', true),
	('moderator', 'Модератор', 'Может просматривать пользователей и блокировать их', true),
	('support', 'Служба поддержки', 'Может просматривать данные и подписки пользователей', true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role_id" varchar(50) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Update existing users to have 'user' role
UPDATE "users" SET "role_id" = 'user' WHERE "role_id" IS NULL OR "role_id" = '';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;