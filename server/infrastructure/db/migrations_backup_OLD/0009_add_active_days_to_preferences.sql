-- Добавление поля active_days к notification_preferences
-- Это позволяет пользователям выбирать дни недели для получения уведомлений

-- Добавляем новую колонку с дефолтным значением (все дни недели: [0,1,2,3,4,5,6])
ALTER TABLE "notification_preferences" 
ADD COLUMN "active_days" jsonb NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb;

-- Комментарий для понимания формата
COMMENT ON COLUMN "notification_preferences"."active_days" IS 'Массив дней недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)';

