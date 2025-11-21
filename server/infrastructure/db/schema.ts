import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  varchar,
  uuid,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }),
  email: varchar('email', { length: 255 }).unique(),
  emailVerifiedAt: timestamp('email_verified_at'),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  country: varchar('country', { length: 100 }),
  locale: varchar('locale', { length: 8 }),
  lastLoginAt: timestamp('last_login_at'),
  lastLoginIp: text('last_login_ip'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const profiles = pgTable('profiles', {
  userId: integer('user_id').notNull(),
  saveHistory: boolean('save_history').default(false).notNull(),
  retentionDays: integer('retention_days').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const aiSessions = pgTable('ai_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  title: text('title'),
});

export const aiMessages = pgTable('ai_messages', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  tokens: integer('tokens'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Encrypted session summaries (AES-GCM: iv+tag base64, ct base64)
export const sessionSummaries = pgTable('session_summaries', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  sessionId: text('session_id').notNull(),
  model: text('model').notNull(),
  summaryIv: text('summary_iv').notNull(),
  summaryCt: text('summary_ct').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// OAuth accounts
export const oauthAccounts = pgTable('oauth_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Telegram accounts
export const telegramAccounts = pgTable('telegram_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  telegramId: integer('telegram_id').notNull(),
  username: varchar('username', { length: 255 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Sessions
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: integer('user_id').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
});

// === User Prompts ===
export const userPrompts = pgTable('user_prompts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  type: varchar('type', { length: 16 }).notNull(), // habits | therapy
  title: text('title').notNull(),
  content: text('content').notNull(),
  lang: varchar('lang', { length: 8 }).default('ru').notNull(),
  isActive: boolean('is_active').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// === Notifications System ===

// Таблица привычек
export const habits = pgTable('habits', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  intent: varchar('intent', { length: 10 }).notNull(), // 'build' | 'quit' | 'custom'
  habitKey: varchar('habit_key', { length: 50 }), // Нормализованный ключ для маппинга на шаблоны (water, smoking, etc.)
  slug: varchar('slug', { length: 255 }), // URL-friendly идентификатор
  emoji: varchar('emoji', { length: 8 }),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Пользовательские темы терапии
export const therapyTopicsCustom = pgTable('therapy_topics_custom', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 255 }), // URL-friendly идентификатор
  description: text('description'),
  emoji: varchar('emoji', { length: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Глобальные настройки пользователя (addressing, tone)
export const userPreferences = pgTable('user_preferences', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().unique(),
  addressing: varchar('addressing', { length: 20 })
    .notNull()
    .default('informal'), // 'informal' | 'formal'
  tone: varchar('tone', { length: 20 }).notNull().default('neutral'), // 'delicate' | 'neutral' | 'uplifting' | 'resolute' | 'demanding'
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Локальные настройки уведомлений (по типу: therapy / habits)
export const notificationPreferences = pgTable('notification_preferences', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
  entityKey: varchar('entity_key', { length: 255 }), // Единое поле для идентификации источника (может быть ID, slug или ключ шаблона)
  enabled: boolean('enabled').default(true).notNull(),
  timesPerDay: integer('times_per_day').notNull(),
  directness: varchar('directness', { length: 20 }).notNull(), // 'soft' | 'moderate' | 'hard'
  timezone: varchar('timezone', { length: 100 }).notNull(), // IANA timezone
  subtype: varchar('subtype', { length: 20 }).default('mixed'), // 'reminder' | 'informational' | 'motivational' | 'mixed' (для habits, по умолчанию 'mixed')
  activeDays: jsonb('active_days')
    .$type<number[]>()
    .notNull()
    .default([0, 1, 2, 3, 4, 5, 6]), // Дни недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
  customSlotTimes: jsonb('custom_slot_times').$type<(number | null)[] | null>(),
  timeRangeStart: integer('time_range_start').notNull().default(540), // Начало временного окна в минутах от начала дня (09:00)
  timeRangeEnd: integer('time_range_end').notNull().default(1350), // Конец временного окна в минутах от начала дня (22:30)
  meta: jsonb('meta'), // Дополнительные параметры (techniques, goalType и т.д.)
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Запланированные слоты уведомлений
export const notificationSlots = pgTable('notification_slots', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
  entityKey: varchar('entity_key', { length: 255 }), // Единое поле для идентификации источника (может быть ID, slug или ключ шаблона)
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(), // UTC с джиттером
  payload: jsonb('payload').notNull(), // { title, body, templateId, action, deepLink, ... }
  templateId: varchar('template_id', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('planned'), // planned | sent | skipped | failed
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Регистрация FCM токенов устройств
export const userDevices = pgTable('user_devices', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  token: text('token').notNull().unique(), // FCM token
  platform: varchar('platform', { length: 20 }).notNull(), // 'ios' | 'android' | 'web'
  lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Факты взаимодействия с уведомлениями
export const notificationInteractions = pgTable('notification_interactions', {
  id: text('id').primaryKey(),
  slotId: text('slot_id').notNull(),
  userId: integer('user_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'yes' | 'no' | 'later' | 'dismissed' | 'unanswered'
  actionAt: timestamp('action_at', { withTimezone: true }).defaultNow(),
  meta: jsonb('meta'),
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
  type: varchar('type', { length: 50 }), // breath_cue | grounding | body_scan | ...
  metric: varchar('metric', { length: 50 }), // steps | training | breath | ...
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Дневная агрегация метрик
export const dailyAdherence = pgTable('daily_adherence', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  date: varchar('date', { length: 10 }).notNull(), // 'YYYY-MM-DD'
  kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
  asked: integer('asked').notNull().default(0),
  yes: integer('yes').notNull().default(0),
  no: integer('no').notNull().default(0),
  later: integer('later').notNull().default(0),
  dismissed: integer('dismissed').notNull().default(0),
  unanswered: integer('unanswered').notNull().default(0),
  completionRate: varchar('completion_rate', { length: 10 })
    .notNull()
    .default('0.0'), // Храним как строку для точности
  streak: integer('streak').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Partial unique index will be added via SQL migration (drizzle-kit)

// AI-сгенерированные тексты уведомлений
export const aiGeneratedNotificationTexts = pgTable(
  'ai_generated_notification_texts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    kind: varchar('kind', { length: 20 }).notNull(), // 'habits' | 'therapy'
    entityKey: varchar('entity_key', { length: 255 }).notNull(), // Единое поле для идентификации источника (может быть ID, slug или ключ шаблона)
    preferenceId: text('preference_id').notNull(), // FK к notification_preferences.id
    textSource: varchar('text_source', { length: 20 }).notNull(), // 'ai' | 'hybrid' (только для AI-текстов)
    texts: jsonb('texts').notNull(), // массив сгенерированных текстов (до 100)
    generationConfigHash: text('generation_config_hash').notNull(), // хеш настроек, влияющих на генерацию
    provider: varchar('provider', { length: 50 }).notNull(), // 'openai' | 'deepseek' | 'groq' | ...
    model: varchar('model', { length: 100 }), // модель, использованная для генерации
    tokensUsed: integer('tokens_used'), // количество токенов
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }), // стоимость генерации
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // опционально: срок действия кеша
  }
);
