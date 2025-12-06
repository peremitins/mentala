-- Миграция: добавление таблицы welcome_prompts для стартовых промптов при выборе режима

CREATE TABLE IF NOT EXISTS welcome_prompts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  mode VARCHAR(16) NOT NULL CHECK (mode IN ('therapy', 'habits', 'talk')),
  is_first_session BOOLEAN NOT NULL DEFAULT true,
  content TEXT NOT NULL,
  lang VARCHAR(8) NOT NULL DEFAULT 'ru',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, mode, is_first_session, lang)
);

CREATE INDEX IF NOT EXISTS idx_welcome_prompts_user_mode ON welcome_prompts(user_id, mode, is_first_session, is_active);

-- Комментарии для документации
COMMENT ON TABLE welcome_prompts IS 'Стартовые промпты для приветствия ассистента при выборе режима на welcome-экране';
COMMENT ON COLUMN welcome_prompts.mode IS 'Режим: therapy | habits | talk';
COMMENT ON COLUMN welcome_prompts.is_first_session IS 'true - для первой сессии (знакомство), false - для повторных (с контекстом)';
COMMENT ON COLUMN welcome_prompts.content IS 'Содержимое промпта, описывающего как ассистент должен начать диалог';
