-- Создаем таблицу для хранения AI-сгенерированных текстов уведомлений
CREATE TABLE ai_generated_notification_texts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL, -- 'habits' | 'therapy'
  entity_id VARCHAR(255) NOT NULL, -- habitId или topicKey
  preference_id TEXT NOT NULL, -- FK к notification_preferences.id
  generation_mode VARCHAR(20) NOT NULL, -- 'ai'
  texts JSONB NOT NULL, -- массив сгенерированных текстов (до 100)
  generation_config_hash TEXT NOT NULL, -- хеш настроек, влияющих на генерацию
  provider VARCHAR(50) NOT NULL, -- 'openai' | 'deepseek' | 'groq' | ...
  model VARCHAR(100), -- модель, использованная для генерации
  tokens_used INTEGER, -- количество токенов
  cost_usd NUMERIC(10, 6), -- стоимость генерации
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE, -- опционально: срок действия кеша
  
  UNIQUE(user_id, preference_id, generation_config_hash)
);

-- Индексы для быстрого поиска
CREATE INDEX idx_ai_texts_user_pref ON ai_generated_notification_texts(user_id, preference_id);
CREATE INDEX idx_ai_texts_config_hash ON ai_generated_notification_texts(generation_config_hash);
CREATE INDEX idx_ai_texts_entity ON ai_generated_notification_texts(user_id, kind, entity_id);
