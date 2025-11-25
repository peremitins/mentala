-- Seed данные для дефолтных welcome-промптов (для userId=0 - системные промпты)
-- Эти промпты используются, если у пользователя нет своих настроенных промптов

-- ПЕРВАЯ СЕССИЯ - ТЕРАПИЯ
INSERT INTO welcome_prompts (user_id, mode, is_first_session, content, lang, is_active, created_at, updated_at)
VALUES (
  0, -- Системный пользователь
  'therapy',
  true,
  'Пользователь выбрал режим "Терапия" для обсуждения эмоций, тревоги и стресса. Это его первая сессия в приложении. Сделай короткое, тёплое приветствие (2-3 предложения), представься и объясни, чем ты можешь помочь в режиме терапии. Заверши одним открытым вопросом, чтобы начать диалог. Не упоминай прошлые разговоры, так как их нет.',
  'ru',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, mode, is_first_session, lang) 
DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();

-- ПОВТОРНАЯ СЕССИЯ - ТЕРАПИЯ
INSERT INTO welcome_prompts (user_id, mode, is_first_session, content, lang, is_active, created_at, updated_at)
VALUES (
  0,
  'therapy',
  false,
  'Пользователь выбрал режим "Терапия" для обсуждения эмоций, тревоги и стресса. Это не первая сессия — у вас есть контекст прошлых бесед.

{{sessionMemoryText}}

Сделай короткое, тёплое приветствие (2-3 предложения), которое:
- Показывает, что ты помнишь основные темы прошлых бесед (без дословного цитирования)
- Мягко предлагает либо вернуться к предыдущим темам, либо перейти к новым
- Завершается одним открытым вопросом для начала диалога',
  'ru',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, mode, is_first_session, lang) 
DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();

-- ПЕРВАЯ СЕССИЯ - ПРИВЫЧКИ
INSERT INTO welcome_prompts (user_id, mode, is_first_session, content, lang, is_active, created_at, updated_at)
VALUES (
  0,
  'habits',
  true,
  'Пользователь выбрал режим "Привычки" для поддержки формирования или отказа от привычек. Это его первая сессия в приложении. Сделай короткое, тёплое приветствие (2-3 предложения), представься и объясни, чем ты можешь помочь в работе с привычками. Заверши одним открытым вопросом, чтобы начать диалог. Не упоминай прошлые разговоры, так как их нет.',
  'ru',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, mode, is_first_session, lang) 
DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();

-- ПОВТОРНАЯ СЕССИЯ - ПРИВЫЧКИ
INSERT INTO welcome_prompts (user_id, mode, is_first_session, content, lang, is_active, created_at, updated_at)
VALUES (
  0,
  'habits',
  false,
  'Пользователь выбрал режим "Привычки" для поддержки формирования или отказа от привычек. Это не первая сессия — у вас есть контекст прошлых бесед.

{{sessionMemoryText}}

Сделай короткое, тёплое приветствие (2-3 предложения), которое:
- Показывает, что ты помнишь основные темы прошлых бесед (без дословного цитирования)
- Мягко предлагает либо вернуться к предыдущим темам, либо перейти к новым
- Завершается одним открытым вопросом для начала диалога',
  'ru',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, mode, is_first_session, lang) 
DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();

-- ПЕРВАЯ СЕССИЯ - ПРОСТО ПОГОВОРИТЬ
INSERT INTO welcome_prompts (user_id, mode, is_first_session, content, lang, is_active, created_at, updated_at)
VALUES (
  0,
  'talk',
  true,
  'Пользователь выбрал свободный диалог без жёсткой темы для эмоциональной разгрузки и общения. Это его первая сессия в приложении. Сделай короткое, тёплое приветствие (2-3 предложения), представься и предложи пообщаться на любые темы. Заверши одним открытым вопросом, чтобы начать диалог. Не упоминай прошлые разговоры, так как их нет.',
  'ru',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, mode, is_first_session, lang) 
DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();

-- ПОВТОРНАЯ СЕССИЯ - ПРОСТО ПОГОВОРИТЬ
INSERT INTO welcome_prompts (user_id, mode, is_first_session, content, lang, is_active, created_at, updated_at)
VALUES (
  0,
  'talk',
  false,
  'Пользователь выбрал свободный диалог без жёсткой темы для эмоциональной разгрузки и общения. Это не первая сессия — у вас есть контекст прошлых бесед.

{{sessionMemoryText}}

Сделай короткое, тёплое приветствие (2-3 предложения), которое:
- Показывает, что ты помнишь основные темы прошлых бесед (без дословного цитирования)
- Мягко предлагает либо вернуться к предыдущим темам, либо перейти к новым
- Завершается одним открытым вопросом для начала диалога',
  'ru',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, mode, is_first_session, lang) 
DO UPDATE SET content = EXCLUDED.content, updated_at = NOW();
