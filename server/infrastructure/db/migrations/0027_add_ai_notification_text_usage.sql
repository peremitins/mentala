-- Создаем таблицу для отслеживания использованных AI-текстов уведомлений
-- Это позволяет избежать повторений текстов между разными генерациями слотов
CREATE TABLE ai_notification_text_usage (
  id SERIAL PRIMARY KEY,
  ai_text_id INTEGER NOT NULL REFERENCES ai_generated_notification_texts(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL REFERENCES notification_slots(id) ON DELETE CASCADE,
  text_index INTEGER NOT NULL, -- Индекс текста в массиве texts
  text_hash TEXT NOT NULL, -- Хеш текста для проверки уникальности
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Один текст не может быть использован дважды в одном слоте
  UNIQUE(ai_text_id, text_index, slot_id)
);

-- Индексы для быстрого поиска
CREATE INDEX idx_usage_ai_text ON ai_notification_text_usage(ai_text_id);
CREATE INDEX idx_usage_sent_at ON ai_notification_text_usage(sent_at);
CREATE INDEX idx_usage_text_hash ON ai_notification_text_usage(text_hash);
CREATE INDEX idx_usage_slot ON ai_notification_text_usage(slot_id);

