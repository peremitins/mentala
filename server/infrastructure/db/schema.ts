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
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Roles table (must be defined before users references it)
export const roles = pgTable('roles', {
  id: varchar('id', { length: 50 }).primaryKey(), // 'admin', 'user', 'moderator', 'support'
  name: varchar('name', { length: 100 }).notNull(), // 'Администратор', 'Пользователь', 'Модератор', 'Поддержка'
  description: text('description'),
  isSystem: boolean('is_system').default(false).notNull(), // системные роли нельзя удалить
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }),
  gender: varchar('gender', { length: 10 }),
  ageRange: varchar('age_range', { length: 20 }),
  onboarding: jsonb('onboarding').notNull().default({}),
  // Настройки фоновой сцены (обои, звук, анимация).
  sceneSettings: jsonb('scene_settings').notNull().default({}),
  email: varchar('email', { length: 255 }).unique().notNull(),
  emailVerifiedAt: timestamp('email_verified_at'),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  country: varchar('country', { length: 100 }),
  locale: varchar('locale', { length: 8 }),
  lastLoginAt: timestamp('last_login_at'),
  lastLoginIp: text('last_login_ip'),
  // Subscription fields
  hasUsedTrial: boolean('has_used_trial').default(false).notNull(),
  trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
  trialEndedAt: timestamp('trial_ended_at', { withTimezone: true }),
  billingCredit: numeric('billing_credit', { precision: 10, scale: 2 })
    .default('0')
    .notNull(), // внутренний кредит в рублях
  timezone: varchar('timezone', { length: 100 }), // IANA timezone для расчета недель
  // Юридические согласия и версии документов
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }),
  termsVersion: varchar('terms_version', { length: 32 }),
  privacyVersion: varchar('privacy_version', { length: 32 }),
  acceptanceSource: varchar('acceptance_source', { length: 16 }),
  acceptanceIp: text('acceptance_ip'),
  acceptanceUserAgent: text('acceptance_user_agent'),
  marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true }),
  marketingConsentSource: varchar('marketing_consent_source', { length: 16 }),
  // Roles and permissions
  roleId: varchar('role_id', { length: 50 })
    .default('user')
    .notNull()
    .references(() => roles.id),
  isBlocked: boolean('is_blocked').default(false).notNull(),
  deletionRequestedAt: timestamp('deletion_requested_at', {
    withTimezone: true,
  }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const profiles = pgTable('profiles', {
  userId: integer('user_id').notNull(),
  // DEPRECATED: Эти поля больше не используются, можно удалить в будущей миграции
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

// User response IDs for previous_response_id support
export const userResponseIds = pgTable('user_response_ids', {
  userId: text('user_id').primaryKey(),
  responseId: text('response_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// OAuth accounts
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
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
  },
  (table) => ({
    providerUserIdUnique: unique('uk_oauth_accounts_provider_user_id').on(
      table.provider,
      table.providerUserId
    ),
  })
);

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
  lastExtendedAt: timestamp('last_extended_at', { withTimezone: true }), // для ограничения частоты продления
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

// === Welcome Prompts ===
// Стартовые промпты для приветствия ассистента на welcome-экране
export const welcomePrompts = pgTable('welcome_prompts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  isFirstSession: boolean('is_first_session').default(true).notNull(),
  content: text('content').notNull(),
  lang: varchar('lang', { length: 8 }).default('ru').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
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
  description: text('description'),
  emoji: varchar('emoji', { length: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Пользовательские дыхательные практики
export const breathPracticesCustom = pgTable(
  'breath_practices_custom',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    phases: jsonb('phases').notNull(), // Массив BreathPhase
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIndex: index('idx_breath_practices_custom_user').on(table.userId),
  })
);

// Каталог медитаций (источник метаданных, аудио лежит в public/)
export const meditationTracks = pgTable(
  'meditation_tracks',
  {
    id: text('id').primaryKey(),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description'),
    topicKey: varchar('topic_key', { length: 40 }).notNull(),
    topicKeys: text('topic_keys')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    audioPath: text('audio_path').notNull(),
    coverPath: text('cover_path'),
    backgroundPath: text('background_path'),
    isLoop: boolean('is_loop').default(false).notNull(),
    durationSeconds: integer('duration_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    topicKeyIndex: index('idx_meditation_tracks_topic_key').on(table.topicKey),
  })
);

// Избранное медитаций (по пользователю)
export const meditationFavorites = pgTable(
  'meditation_favorites',
  {
    userId: integer('user_id').notNull(),
    trackId: text('track_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIndex: index('idx_meditation_favorites_user').on(table.userId),
    trackIndex: index('idx_meditation_favorites_track').on(table.trackId),
    uniqueUserTrack: unique('uk_meditation_favorites_user_track').on(
      table.userId,
      table.trackId
    ),
  })
);

// Глобальные настройки пользователя (addressing, tone)
export const userPreferences = pgTable('user_preferences', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().unique(),
  addressing: varchar('addressing', { length: 20 })
    .notNull()
    .default('informal'), // 'informal' | 'formal'
  tone: varchar('tone', { length: 20 }).notNull().default('neutral'), // 'delicate' | 'neutral' | 'uplifting' | 'resolute' | 'demanding'
  meditationTimerMinutes: integer('meditation_timer_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Настройки чата (voice, avatar, enablePreviousResponseId, enableSummary)
export const chatSettings = pgTable('chat_settings', {
  userId: integer('user_id').primaryKey().notNull(),
  voice: boolean('voice').notNull().default(true),
  avatar: boolean('avatar').notNull().default(true),
  enablePreviousResponseId: boolean('enable_previous_response_id')
    .notNull()
    .default(true),
  enableSummary: boolean('enable_summary').notNull().default(true),
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
  entityKey: varchar('entity_key', { length: 255 }), // Единое поле для идентификации источника (ID для кастомных, ключ шаблона для шаблонных)
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
  meta: jsonb('meta'), // Дополнительные параметры (textSource: 'templates' | 'ai' | 'hybrid')
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Запланированные слоты уведомлений
export const notificationSlots = pgTable(
  'notification_slots',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').notNull(),
    kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
    entityKey: varchar('entity_key', { length: 255 }), // Единое поле для идентификации источника (ID для кастомных, ключ шаблона для шаблонных)
    entityDisplayName: varchar('entity_display_name', { length: 255 }), // Читаемое название сущности (для удобства разработчиков, не участвует в логике)
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(), // UTC с джиттером
    scheduledAtLocal: timestamp('scheduled_at_local'), // Локальное время отправки (timestamp without time zone для удобства просмотра в БД, nullable для существующих записей)
    payload: jsonb('payload').notNull(), // { title, body, templateId, action, deepLink, ... }
    templateId: varchar('template_id', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('planned'), // planned | queued | sent | skipped | failed
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Индекс для быстрого поиска due-слотов (используется в processDueSlots для BullMQ)
    // Partial index для planned и queued слотов (queued - поставлены в очередь, но еще не обработаны)
    statusScheduledIdx: index('idx_notification_slots_status_scheduled')
      .on(table.status, table.scheduledAt)
      .where(sql`${table.status} IN ('planned', 'queued')`),
    // Индекс для поиска слотов по пользователю и статусу
    userStatusIdx: index('idx_notification_slots_user_status').on(
      table.userId,
      table.status
    ),
  })
);

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
    entityKey: varchar('entity_key', { length: 255 }).notNull(), // Единое поле для идентификации источника (ID для кастомных, ключ шаблона для шаблонных)
    entityDisplayName: varchar('entity_display_name', { length: 255 }), // Читаемое название сущности (для удобства разработчиков, не участвует в логике)
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
  },
  (table) => ({
    // Уникальный индекс для ON CONFLICT в ai_generated_notification_texts
    userPrefHashUnique: unique(
      'ai_generated_notification_texts_user_pref_hash_unique'
    ).on(table.userId, table.preferenceId, table.generationConfigHash),
  })
);

// Отслеживание использованных AI-текстов уведомлений
export const aiNotificationTextUsage = pgTable('ai_notification_text_usage', {
  id: serial('id').primaryKey(),
  aiTextId: integer('ai_text_id')
    .notNull()
    .references(() => aiGeneratedNotificationTexts.id, {
      onDelete: 'cascade',
    }),
  slotId: text('slot_id')
    .notNull()
    .references(() => notificationSlots.id, { onDelete: 'cascade' }),
  textIndex: integer('text_index').notNull(), // Индекс текста в массиве texts
  textHash: text('text_hash').notNull(), // Хеш текста для проверки уникальности
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
});

// Единая таблица для дефолтных и пользовательских текстов уведомлений
export const notificationTexts = pgTable('notification_texts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'habits' | 'therapy'
  entityKey: text('entity_key').notNull(), // 'water', 'anxiety', кастомный id и т.п.
  userId: integer('user_id'), // NULL = системный дефолт, не NULL = пользовательский
  source: text('source').notNull(), // 'default' | 'user'
  intent: text('intent'), // 'build' | 'quit' (только habits, если нужно)
  subtype: text('subtype'), // 'reminder' | 'informational' | 'motivational' | 'mixed' | NULL
  directness: text('directness').notNull(), // 'soft' | 'moderate' | 'hard' | 'universal'
  addressing: text('addressing').notNull(), // 'informal' | 'formal' | 'universal'
  locale: text('locale').notNull(), // 'ru' (пока одна, но заложимся)
  text: text('text').notNull(), // сам текст
  sortOrder: integer('sort_order').notNull().default(0), // порядок внутри списка
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Эталон дефолтных текстов (read-only, для восстановления)
export const notificationTextPresets = pgTable('notification_text_presets', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'habits' | 'therapy'
  entityKey: text('entity_key').notNull(), // 'water', 'anxiety' и т.п.
  intent: text('intent'), // 'build' | 'quit' | NULL
  subtype: text('subtype'), // 'reminder' | 'informational' | 'motivational' | 'mixed' | NULL
  directness: text('directness').notNull(), // 'soft' | 'moderate' | 'hard' | 'universal'
  addressing: text('addressing').notNull(), // 'informal' | 'formal' | 'universal'
  locale: text('locale').notNull(), // 'ru'
  text: text('text').notNull(), // сам текст
  sortOrder: integer('sort_order').notNull().default(0),
});

// === Subscription System ===

// Отслеживание использования trial по email (anti-abuse)
export const trialUsageTracking = pgTable(
  'trial_usage_tracking',
  {
    id: serial('id').primaryKey(),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    emailHash: varchar('email_hash', { length: 64 }).notNull().unique(),
    firstTrialStartedAt: timestamp('first_trial_started_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    lastTrialStartedAt: timestamp('last_trial_started_at', {
      withTimezone: true,
    }),
    totalDaysUsed: integer('total_days_used').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    emailNormalizedIdx: index('idx_trial_usage_email_normalized').on(
      table.emailNormalized
    ),
    emailHashIdx: index('idx_trial_usage_email_hash').on(table.emailHash),
  })
);

// Тарифные планы (конфигурация)
export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar('id', { length: 50 }).primaryKey(), // 'basic', 'pro', 'premium'
  name: varchar('name', { length: 20 }).notNull(), // 'basic' | 'pro' | 'premium'
  basePrice: numeric('base_price', { precision: 10, scale: 2 }).notNull(), // базовая месячная цена в рублях
  weeklyMinutesLimit: integer('weekly_minutes_limit').notNull(), // лимит минут в неделю
  avatarEnabled: boolean('avatar_enabled').default(false).notNull(), // доступен ли аватар
  isVisibleInUI: boolean('is_visible_in_ui').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Подписки пользователей
export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: varchar('plan_id', { length: 50 })
      .notNull()
      .references(() => subscriptionPlans.id),
    billingPeriod: varchar('billing_period', { length: 10 })
      .notNull()
      .default('month'), // 'month' | 'year'
    // Checkout fields (для безопасной валидации webhook и корректного учёта billingCredit)
    checkoutAmount: numeric('checkout_amount', { precision: 10, scale: 2 })
      .default('0')
      .notNull(), // ожидаемая сумма к оплате (toPay после применения кредита)
    checkoutCurrency: varchar('checkout_currency', { length: 3 })
      .default('RUB')
      .notNull(),
    billingCreditApplied: numeric('billing_credit_applied', {
      precision: 10,
      scale: 2,
    })
      .default('0')
      .notNull(), // сколько кредита применили для уменьшения toPay
    billingCreditGranted: numeric('billing_credit_granted', {
      precision: 10,
      scale: 2,
    })
      .default('0')
      .notNull(), // сколько кредита нужно начислить при финализации (downgrade)
    yookassaPaymentId: text('yookassa_payment_id'), // payment.id в YooKassa (если известен)
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    paymentStatus: varchar('payment_status', { length: 20 })
      .notNull()
      .default('pending'), // 'active' | 'expired' | 'pending' | 'canceled'
    autoRenew: boolean('auto_renew').default(false).notNull(),
    sourcePlatform: varchar('source_platform', { length: 20 })
      .default('web')
      .notNull(), // 'web' | 'ios' | 'android'
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Индекс для поиска активных подписок пользователя
    userStatusIdx: index('idx_user_subscriptions_user_status').on(
      table.userId,
      table.paymentStatus
    ),
    // Индекс для поиска истекших подписок
    expiredIdx: index('idx_user_subscriptions_expired').on(
      table.paymentStatus,
      table.endDate
    ),
    // Уникальность payment.id от YooKassa (Postgres допускает множество NULL)
    yookassaPaymentUnique: unique(
      'uk_user_subscriptions_yookassa_payment_id'
    ).on(table.yookassaPaymentId),
  })
);

// Сессии терапии (для подсчета времени)
export const therapySessions = pgTable(
  'therapy_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(), // когда отправлено первое сообщение
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }), // последняя активность в сессии
    endedAt: timestamp('ended_at', { withTimezone: true }), // когда сессия завершена
    durationSeconds: integer('duration_seconds').default(0).notNull(), // длительность в секундах
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Индекс для поиска сессий пользователя по дате (для расчета недели)
    userStartedIdx: index('idx_therapy_sessions_user_started').on(
      table.userId,
      table.startedAt
    ),
  })
);

// События подписок (для аналитики)
export const subscriptionEvents = pgTable('subscription_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'trial_started', 'trial_ended', 'checkout_started', 'purchase_success', etc.
  planId: varchar('plan_id', { length: 50 }),
  metadata: jsonb('metadata'), // дополнительные данные события
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Платежи от YooKassa (для проверки уникальности и идемпотентности)
export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(), // payment.id от YooKassa
    subscriptionId: integer('subscription_id').references(
      () => userSubscriptions.id,
      {
        onDelete: 'set null',
      }
    ),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(), // сумма в рублях
    currency: varchar('currency', { length: 3 }).notNull().default('RUB'),
    status: varchar('status', { length: 20 }).notNull(), // 'succeeded', 'canceled', 'pending'
    metadata: jsonb('metadata'), // дополнительные данные от YooKassa
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Индекс для быстрого поиска по subscriptionId
    subscriptionIdx: index('idx_payments_subscription').on(
      table.subscriptionId
    ),
    // Индекс для поиска по пользователю
    userIdx: index('idx_payments_user').on(table.userId),
  })
);

// Идемпотентность для команд (checkout, webhook, etc.)
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    route: varchar('route', { length: 255 }).notNull(), // путь API
    key: text('key').notNull(), // Idempotency-Key заголовок
    responseHash: text('response_hash'), // хеш ответа для возврата того же результата
    responseJson: jsonb('response_json'), // исходный JSON ответа для повторов
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // TTL для очистки старых ключей
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Уникальная пара user_id + route + key
    uniqueKey: unique('uk_idempotency_user_route_key').on(
      table.userId,
      table.route,
      table.key
    ),
    // Индекс для очистки просроченных ключей
    expiresIdx: index('idx_idempotency_expires').on(table.expiresAt),
  })
);

// Security events для логирования подозрительных событий
export const securityEvents = pgTable(
  'security_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }), // nullable: события могут логироваться до определения user
    eventType: varchar('event_type', { length: 50 }).notNull(), // 'csrf_mismatch', 'ip_mismatch', 'ua_mismatch', 'suspicious_login', 'origin_mismatch', 'auth_dual_channel_mismatch', 'auth_header_used_on_web', 'logout_everywhere'
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'), // может содержать sessionId, requestId, anonymousSession для расследования инцидентов
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Индекс для поиска событий по пользователю и дате
    userCreatedIdx: index('idx_security_events_user_created').on(
      table.userId,
      table.createdAt
    ),
    // Индекс для поиска событий без userId (для расследования)
    eventTypeCreatedIdx: index('idx_security_events_type_created').on(
      table.eventType,
      table.createdAt
    ),
  })
);

// === Content Generation System ===

// Таблица для хранения сгенерированных постов
export const contentPosts = pgTable(
  'content_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Параметры генерации (денормализованы для производительности)
    platform: varchar('platform', { length: 20 }).notNull(),
    format: varchar('format', { length: 50 }).notNull(),
    topic: text('topic').notNull(),
    goal: varchar('goal', { length: 50 }),
    toneLevel: integer('tone_level').notNull(),
    addressing: varchar('addressing', { length: 10 }).notNull(),
    length: varchar('length', { length: 20 }).notNull(),
    ctaType: varchar('cta_type', { length: 50 }).notNull(),
    ctaText: text('cta_text'),
    ctaPayload: text('cta_payload'),
    // Контент
    content: text('content').notNull(), // форматированный (с markdown/HTML)
    assets: jsonb('assets').notNull().default({}), // slides, cover_titles, story_prompts, reels_script, extra_titles, extra_cta_variants etc.
    safetyFlags: jsonb('safety_flags').notNull().default({}), // sensitive_topic, disclaimer_added, rejected_reason etc.
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft|selected|published|rejected|needs_review
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedPlatform: varchar('published_platform', { length: 20 }), // telegram|instagram
    publishedUrl: text('published_url'),
    tags: jsonb('tags').$type<string[]>().default([]), // теги для организации (v2, но можно добавить сразу)
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    platformStatusCreatedIdx: index('idx_cp_platform_status_created_at').on(
      table.platform,
      table.status,
      table.createdAt
    ),
    topicCreatedIdx: index('idx_cp_topic_created_at').on(
      table.topic,
      table.createdAt
    ),
  })
);
