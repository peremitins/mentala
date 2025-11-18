-- Таблица пользовательских тем терапии

CREATE TABLE IF NOT EXISTS "therapy_topics_custom" (
  "id" text PRIMARY KEY,
  "user_id" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text,
  "emoji" varchar(8),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE "therapy_topics_custom" IS 'Пользовательские темы терапии';
COMMENT ON COLUMN "therapy_topics_custom"."name" IS 'Название пользовательской темы';
COMMENT ON COLUMN "therapy_topics_custom"."emoji" IS 'Иконка темы';

CREATE INDEX IF NOT EXISTS "therapy_topics_custom_user_idx"
ON "therapy_topics_custom" ("user_id");
