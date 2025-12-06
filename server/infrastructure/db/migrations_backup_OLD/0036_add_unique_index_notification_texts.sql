-- Миграция: Добавление уникального индекса для предотвращения дублей текстов уведомлений
-- Защита от race conditions при параллельной инициализации текстов

BEGIN;

-- Уникальный индекс для предотвращения дублей текстов
-- Индекс учитывает все поля, определяющие уникальность текста для пользователя
-- Используется COALESCE для NULL значений, чтобы они не нарушали уникальность
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_texts_unique_user_text
ON notification_texts (
  user_id,
  kind,
  entity_key,
  source,
  locale,
  COALESCE(intent, ''),
  COALESCE(subtype, ''),
  directness,
  addressing
)
WHERE is_deleted = FALSE;

-- Комментарий к индексу для документации
COMMENT ON INDEX idx_notification_texts_unique_user_text IS 
  'Уникальный индекс для предотвращения дублей текстов уведомлений. Защита от race conditions при параллельной инициализации. Применяется только к активным (не удаленным) текстам.';

COMMIT;

