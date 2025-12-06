-- Добавляет описание для пользовательских привычек

ALTER TABLE "habits"
ADD COLUMN IF NOT EXISTS "description" text;

COMMENT ON COLUMN "habits"."description" IS 'Опциональное описание пользовательской привычки';

