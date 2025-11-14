-- Добавление временного диапазона к notification_preferences
-- Это позволяет пользователям выбирать временное окно для получения уведомлений

-- Добавляем колонку для начала временного окна (09:00 = 540 минут)
ALTER TABLE "notification_preferences" 
ADD COLUMN "time_range_start" integer NOT NULL DEFAULT 540;

-- Добавляем колонку для конца временного окна (22:30 = 1350 минут)
ALTER TABLE "notification_preferences" 
ADD COLUMN "time_range_end" integer NOT NULL DEFAULT 1350;

-- Комментарии для понимания формата
COMMENT ON COLUMN "notification_preferences"."time_range_start" IS 'Начало временного окна в минутах от начала дня (0-1439). Дефолт: 540 (09:00)';
COMMENT ON COLUMN "notification_preferences"."time_range_end" IS 'Конец временного окна в минутах от начала дня (0-1439). Дефолт: 1350 (22:30)';


