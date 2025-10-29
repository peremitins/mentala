CREATE TABLE "user_prompts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "type" varchar(16) NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "lang" varchar(8) DEFAULT 'ru' NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
-- Ограничение: не более одного активного на тип у пользователя
CREATE UNIQUE INDEX "user_prompts_active_unique" ON "user_prompts" ("user_id", "type") WHERE (is_active = true);
-- По желанию индексы по user_id и type
CREATE INDEX "user_prompts_user_id_idx" ON "user_prompts" ("user_id");
CREATE INDEX "user_prompts_type_idx" ON "user_prompts" ("type");

