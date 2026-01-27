-- Миграция: добавление таблицы chat_settings для хранения настроек чата пользователя
-- Заменяет in-memory storage на персистентное хранилище в PostgreSQL

CREATE TABLE IF NOT EXISTS chat_settings (
  user_id INTEGER PRIMARY KEY NOT NULL,
  theme VARCHAR(10) NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'gray')),
  mode VARCHAR(20) NOT NULL DEFAULT 'therapy' CHECK (mode IN ('therapy', 'habits')),
  voice BOOLEAN NOT NULL DEFAULT true,
  avatar BOOLEAN NOT NULL DEFAULT true,
  enable_previous_response_id BOOLEAN NOT NULL DEFAULT true,
  enable_summary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Индекс для быстрого поиска (хотя PRIMARY KEY уже создает индекс)
-- Но можно добавить дополнительные индексы, если понадобится

-- Комментарии для документации
COMMENT ON TABLE chat_settings IS 'Настройки чата пользователя: тема, режим, голос, аватар, память ИИ, память приложения';
COMMENT ON COLUMN chat_settings.user_id IS 'ID пользователя (PRIMARY KEY, один настройки на пользователя)';
COMMENT ON COLUMN chat_settings.theme IS 'Тема интерфейса: dark | light | gray';
COMMENT ON COLUMN chat_settings.mode IS 'Режим работы ассистента: therapy | habits';
COMMENT ON COLUMN chat_settings.voice IS 'Включена ли озвучка ответов ассистента';
COMMENT ON COLUMN chat_settings.avatar IS 'Включен ли визуальный аватар (HeyGen)';
COMMENT ON COLUMN chat_settings.enable_previous_response_id IS 'Включена ли оптимизация контекста через previous_response_id (память ИИ)';
COMMENT ON COLUMN chat_settings.enable_summary IS 'Включена ли долгосрочная память через session summaries (память приложения)';

