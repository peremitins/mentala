-- Добавляет возможность хранить кастомные времена слотов уведомлений

ALTER TABLE "notification_preferences"
ADD COLUMN IF NOT EXISTS "custom_slot_times" jsonb;

COMMENT ON COLUMN "notification_preferences"."custom_slot_times" IS
  'Массив пользовательских времен слотов (в минутах, 0-1439) для каждого уведомления в день';


