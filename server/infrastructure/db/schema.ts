import {
  type AnyPgColumn,
  pgTable,
  bigserial,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  smallint,
  varchar,
  uuid,
  jsonb,
  numeric,
  check,
  unique,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { DEFAULT_ASSISTANT_VOICE_ID } from '../../../shared/constants/assistantVoiceCatalog';

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

export const users = pgTable(
  'users',
  {
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
    // Источник и значение storefront (регион App Store аккаунта пользователя).
    // Нужны для разведения сценариев оплаты на iOS (RU -> внешняя оплата, WW -> Apple IAP).
    billingRegionSource: varchar('billing_region_source', { length: 20 }), // 'storefront' | null
    billingStorefrontCountry: varchar('billing_storefront_country', {
      length: 2,
    }), // 'RU' | 'DE' | ... | null
    billingStorefrontUpdatedAt: timestamp('billing_storefront_updated_at', {
      withTimezone: true,
    }),
    // Стабильный appAccountToken для привязки Apple IAP к аккаунту Mentala.
    appleAppAccountToken: uuid('apple_app_account_token'),
    // Trial-scheduled биллинг (оплата в конце пробного периода).
    billingPlanId: varchar('billing_plan_id', { length: 50 }).references(
      () => subscriptionPlans.id,
      { onDelete: 'set null' }
    ),
    billingPeriod: varchar('billing_period', { length: 10 }), // 'month' | 'year'
    nextChargeAt: timestamp('next_charge_at', { withTimezone: true }),
    paymentMethodBound: boolean('payment_method_bound')
      .default(false)
      .notNull(),
    paymentMethodId: text('payment_method_id'),
    paymentMethodType: varchar('payment_method_type', { length: 50 }),
    paymentMethodTitle: text('payment_method_title'),
    paymentMethodCardBrand: varchar('payment_method_card_brand', {
      length: 50,
    }),
    paymentMethodCardLast4: varchar('payment_method_card_last4', { length: 4 }),
    paymentMethodCardExpiryMonth: varchar('payment_method_card_expiry_month', {
      length: 2,
    }),
    paymentMethodCardExpiryYear: varchar('payment_method_card_expiry_year', {
      length: 4,
    }),
    paymentMethodBindingId: text('payment_method_binding_id'),
    paymentMethodBindingSessionId: text('payment_method_binding_session_id'),
    paymentMethodBindingStatus: varchar('payment_method_binding_status', {
      length: 20,
    })
      .default('none')
      .notNull(), // 'none' | 'pending' | 'active' | 'failed'
    paymentMethodBindingUpdatedAt: timestamp(
      'payment_method_binding_updated_at',
      {
        withTimezone: true,
      }
    ),
    billingCollectionStatus: varchar('billing_collection_status', {
      length: 20,
    })
      .default('none')
      .notNull(), // 'none' | 'scheduled' | 'past_due'
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    // Legacy-поле от старого pre-charge reminder flow.
    // Отправка напоминаний о будущем списании выключена, но колонку пока сохраняем
    // для обратной совместимости без отдельной миграции.
    billingReminderSentAt: timestamp('billing_reminder_sent_at', {
      withTimezone: true,
    }),
    billingLockedAt: timestamp('billing_locked_at', { withTimezone: true }),
    billingLockedBy: varchar('billing_locked_by', { length: 100 }),
    // Запланированная смена тарифа (last-write-wins).
    scheduledPlanId: varchar('scheduled_plan_id', { length: 50 }).references(
      () => subscriptionPlans.id,
      { onDelete: 'set null' }
    ),
    scheduledBillingPeriod: varchar('scheduled_billing_period', {
      length: 10,
    }), // 'month' | 'year'
    scheduledChangeAt: timestamp('scheduled_change_at', { withTimezone: true }),
    scheduledFromSubscriptionId: integer(
      'scheduled_from_subscription_id'
    ).references((): AnyPgColumn => userSubscriptions.id, {
      onDelete: 'set null',
    }),
    scheduledChangeUpdatedAt: timestamp('scheduled_change_updated_at', {
      withTimezone: true,
    }),
    // Юридические согласия и версии документов
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }),
    termsVersion: varchar('terms_version', { length: 32 }),
    privacyVersion: varchar('privacy_version', { length: 32 }),
    acceptanceSource: varchar('acceptance_source', { length: 16 }),
    acceptanceIp: text('acceptance_ip'),
    acceptanceUserAgent: text('acceptance_user_agent'),
    marketingConsentAt: timestamp('marketing_consent_at', {
      withTimezone: true,
    }),
    marketingConsentSource: varchar('marketing_consent_source', { length: 16 }),
    aiConsentAccepted: boolean('ai_consent_accepted').default(false).notNull(),
    aiConsentAcceptedAt: timestamp('ai_consent_accepted_at', {
      withTimezone: true,
    }),
    aiConsentVersion: varchar('ai_consent_version', { length: 32 }),
    aiConsentLocale: varchar('ai_consent_locale', { length: 8 }),
    pushNotificationsEnabled: boolean('push_notifications_enabled')
      .default(true)
      .notNull(),
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
  },
  (table) => ({
    appleAppAccountTokenUnique: unique('uk_users_apple_app_account_token').on(
      table.appleAppAccountToken
    ),
    // Legacy-индекс от старого reminder flow.
    // Пока не удаляем его из схемы БД в этом таске, чтобы не тянуть миграцию.
    trialBillingReminderDueIdx: index('idx_users_trial_billing_reminder_due')
      .on(table.nextChargeAt, table.id)
      .where(
        sql`${table.billingCollectionStatus} = 'scheduled' and ${table.billingReminderSentAt} is null and ${table.nextChargeAt} is not null`
      ),
  })
);

// История способов оплаты пользователя (active/archived).
export const userPaymentMethods = pgTable(
  'user_payment_methods',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).default('yookassa').notNull(),
    providerPaymentMethodId: text('provider_payment_method_id').notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(), // 'active' | 'archived'
    isDefault: boolean('is_default').default(false).notNull(),
    paymentMethodType: varchar('payment_method_type', { length: 50 }),
    paymentMethodTitle: text('payment_method_title'),
    cardBrand: varchar('card_brand', { length: 50 }),
    cardLast4: varchar('card_last4', { length: 4 }),
    cardExpiryMonth: varchar('card_expiry_month', { length: 2 }),
    cardExpiryYear: varchar('card_expiry_year', { length: 4 }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueProviderMethodPerUser: unique(
      'uk_user_payment_methods_user_provider_method'
    ).on(table.userId, table.providerPaymentMethodId),
    userStatusIdx: index('idx_user_payment_methods_user_status').on(
      table.userId,
      table.status
    ),
    userDefaultIdx: index('idx_user_payment_methods_user_default').on(
      table.userId,
      table.isDefault
    ),
  })
);

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
export const sessionSummaries = pgTable(
  'session_summaries',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    sessionId: text('session_id').notNull(),
    therapySessionId: integer('therapy_session_id').references(
      () => therapySessions.id,
      {
        onDelete: 'cascade',
      }
    ),
    model: text('model').notNull(),
    summaryKind: varchar('summary_kind', { length: 32 })
      .notNull()
      .default('handoff'),
    schemaVersion: integer('schema_version').notNull().default(1),
    summaryIv: text('summary_iv').notNull(),
    summaryCt: text('summary_ct').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    therapySessionUnique: uniqueIndex(
      'uk_session_summaries_therapy_session_id'
    ).on(table.therapySessionId),
    userCreatedIdx: index('idx_session_summaries_user_created_at').on(
      table.userId,
      table.createdAt
    ),
  })
);

// Encrypted durable user memory profile (AES-GCM: iv+tag base64, ct base64)
export const userMemoryProfiles = pgTable('user_memory_profiles', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, {
      onDelete: 'cascade',
    }),
  schemaVersion: integer('schema_version').notNull().default(1),
  memoryIv: text('memory_iv').notNull(),
  memoryCt: text('memory_ct').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
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

// === Landing ===

export const landingConfig = pgTable('landing_config', {
  id: serial('id').primaryKey(),
  isReleased: boolean('is_released').notNull().default(false),
  ctaUrl: varchar('cta_url', { length: 255 })
    .notNull()
    .default('https://my.mentala.app/auth'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const landingLeads = pgTable(
  'landing_leads',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    emailNormalized: varchar('email_normalized', { length: 255 }).notNull(),
    emailHash: varchar('email_hash', { length: 64 }).notNull(),
    /** JSON-массив ключей целей, например ["reduce_anxiety","other"] */
    goalKey: text('goal_key'),
    utmSource: varchar('utm_source', { length: 120 }),
    utmMedium: varchar('utm_medium', { length: 120 }),
    utmCampaign: varchar('utm_campaign', { length: 120 }),
    referrer: text('referrer'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    emailHashUnique: uniqueIndex('uk_landing_leads_email_hash').on(
      table.emailHash
    ),
    createdAtIdx: index('idx_landing_leads_created_at').on(table.createdAt),
  })
);

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

// === Gratitude Diary ===
export const gratitudeDiaryEntries = pgTable(
  'gratitude_diary_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    text: text('text').notNull(),
    mood: varchar('mood', { length: 20 }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    photoUrl: text('photo_url'),
    // Ключ объекта в Object Storage: user-uploads/gratitude-diary/{userId}/{ts}-{uuid}.webp
    // Публичный URL строится динамически: ${CDN_BASE}/${photoStorageKey}.
    // Поле null для legacy-записей с локальными URL (/uploads/...).
    photoStorageKey: text('photo_storage_key'),
    // Текст вопроса-подсказки, который был активен при создании записи
    promptText: text('prompt_text'),
    inputMethod: varchar('input_method', { length: 12 })
      .notNull()
      .default('text'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userCreatedIdx: index('idx_gratitude_diary_entries_user_created').on(
      table.userId,
      table.createdAt
    ),
  })
);

export const gratitudeDiaryWorksheetTemplates = pgTable(
  'gratitude_diary_worksheet_templates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    // Храним персональный шаблон целиком, чтобы поддержать произвольные формулировки и эмодзи.
    items: jsonb('items')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userUniqueIdx: uniqueIndex(
      'uk_gratitude_diary_worksheet_templates_user'
    ).on(table.userId),
    userUpdatedIdx: index('idx_gratitude_diary_worksheet_templates_user').on(
      table.userId,
      table.updatedAt
    ),
  })
);

// Избранные промпты пользователя в дневнике благодарности.
// Два типа: 'catalog' — ссылка на системный промпт, 'custom' — пользовательский текст.
export const gratitudeDiaryFavoritePrompts = pgTable(
  'gratitude_diary_favorite_prompts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    // 'catalog' — ссылка на системный промпт из catalog.ts, 'custom' — пользовательский текст
    promptType: varchar('prompt_type', { length: 10 }).notNull(),
    // Для catalog: id промпта из каталога (например 'self-1', 'health-3')
    catalogPromptId: varchar('catalog_prompt_id', { length: 64 }),
    // Для custom: текст промпта (ограничен 220 символами на уровне БД)
    customText: varchar('custom_text', { length: 220 }),
    // Порядок отображения (для будущего ручного перетаскивания, сейчас сортируем по created_at)
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Индекс для быстрой выборки избранных пользователя, сортировка по created_at DESC
    userCreatedIdx: index('idx_gratitude_favorite_user_created').on(
      table.userId,
      table.createdAt
    ),
    // Partial unique index: один каталожный промпт в избранном одного пользователя
    userCatalogUniqueIdx: uniqueIndex('uk_gratitude_favorite_user_catalog')
      .on(table.userId, table.catalogPromptId)
      .where(sql`${table.catalogPromptId} IS NOT NULL`),
    // Partial unique index: дедупликация кастомных промптов по тексту
    // Защищает от двойной миграции (если пользователь открыл 2 вкладки одновременно)
    userCustomTextUniqueIdx: uniqueIndex(
      'uk_gratitude_favorite_user_custom_text'
    )
      .on(table.userId, table.customText)
      .where(sql`${table.customText} IS NOT NULL`),
    // Тип промпта ограничен допустимыми значениями
    promptTypeCheck: check(
      'chk_gratitude_favorite_prompt_type',
      sql`${table.promptType} IN ('catalog', 'custom')`
    ),
    // Консистентность полиморфных записей:
    // catalog → catalog_prompt_id NOT NULL, custom_text IS NULL
    // custom → custom_text NOT NULL, catalog_prompt_id IS NULL
    typeConsistencyCheck: check(
      'chk_gratitude_favorite_type_consistency',
      sql`(${table.promptType} = 'catalog' AND ${table.catalogPromptId} IS NOT NULL AND ${table.customText} IS NULL)
          OR
          (${table.promptType} = 'custom' AND ${table.customText} IS NOT NULL AND ${table.catalogPromptId} IS NULL)`
    ),
  })
);

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
  tone: varchar('tone', { length: 20 }).notNull().default('balanced'), // 'gentle' | 'balanced' | 'uplifting' | 'direct' | 'unknown'
  // Legacy single-select колонка. Держим до полного rollout массива причин.
  onboardingReason: varchar('onboarding_reason', { length: 40 }),
  // Контекст welcome-онбординга для персонализации рекомендаций и общения.
  onboardingReasons: text('onboarding_reasons')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
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
  assistantVoice: varchar('assistant_voice', { length: 80 })
    .notNull()
    .default(DEFAULT_ASSISTANT_VOICE_ID),
  avatar: boolean('avatar').notNull().default(true),
  enablePreviousResponseId: boolean('enable_previous_response_id')
    .notNull()
    .default(true),
  enableSummary: boolean('enable_summary').notNull().default(true),
  lastGreetingAt: timestamp('last_greeting_at', {
    withTimezone: true,
  }),
  lastNameGreetingAt: timestamp('last_name_greeting_at', {
    withTimezone: true,
  }),
  // Последний подтвержденный фокус внутри темы "Страхи".
  lastTherapyFocus: jsonb('last_therapy_focus').$type<{
    topicId: 'phobias';
    subtopicKey:
      | 'public_speaking'
      | 'heights'
      | 'confined_spaces'
      | 'social_fear'
      | 'other_specific';
    subtopicLabel: string;
    confirmedByUser: true;
    updatedAt: string;
  } | null>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Локальные настройки уведомлений (по типу: therapy / habits)
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
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
    customSlotTimes: jsonb('custom_slot_times').$type<
      (number | null)[] | null
    >(),
    timeRangeStart: integer('time_range_start').notNull().default(540), // Начало временного окна в минутах от начала дня (09:00)
    timeRangeEnd: integer('time_range_end').notNull().default(1350), // Конец временного окна в минутах от начала дня (22:30)
    customPromptNotification: text('custom_prompt_notification'), // Персональные пожелания для шаблонных тем (только AI)
    meta: jsonb('meta'), // Дополнительные параметры (textSource: 'templates' | 'ai')
    // Нормализованное значение textSource (любой не-`ai` трактуется как `templates`)
    textSourceNormalized: varchar('text_source_normalized', {
      length: 20,
    }).generatedAlwaysAs(
      (): SQL =>
        sql`CASE WHEN ${notificationPreferences.meta} ->> 'textSource' = 'ai' THEN 'ai' ELSE 'templates' END`
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Критичный partial index для инкрементального обхода scheduler по enabled prefs.
    enabledUserIdx: index('idx_notification_preferences_enabled_user')
      .on(table.userId)
      .where(sql`${table.enabled} = true`),
  })
);

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
    // Идемпотентность активных слотов (planned + queued) без поля status.
    activeSlotUniqueIdx: uniqueIndex('uk_notification_slots_active')
      .on(table.userId, table.kind, table.entityKey, table.scheduledAt)
      .where(sql`${table.status} IN ('planned', 'queued')`),
  })
);

// Курсор обхода scheduler по каждому shard.
export const slotsSchedulerCursor = pgTable(
  'slots_scheduler_cursor',
  {
    shard: integer('shard').primaryKey(),
    lastUserId: integer('last_user_id').notNull().default(0),
    cycleId: integer('cycle_id').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    updatedAtIdx: index('idx_slots_scheduler_cursor_updated_at').on(
      table.updatedAt
    ),
  })
);

// Глобальное состояние scheduler: текущий cycle и указатель round-robin по shard.
export const slotsSchedulerState = pgTable('slots_scheduler_state', {
  id: text('id').primaryKey().default('global'),
  globalCycleId: integer('global_cycle_id').notNull().default(1),
  nextShard: integer('next_shard').notNull().default(0),
  completedShards: jsonb('completed_shards')
    .$type<number[]>()
    .notNull()
    .default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Регистрация FCM токенов устройств (нативных и web push)
export const userDevices = pgTable('user_devices', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull(),
  token: text('token').notNull().unique(), // FCM token
  platform: varchar('platform', { length: 20 }).notNull(), // 'ios' | 'android' | 'web'
  appEnv: varchar('app_env', { length: 10 }).notNull().default('dev'), // 'dev' | 'prod'
  // Тип канала доставки: 'native' (Capacitor push) | 'pwa' (Web Push)
  channelType: varchar('channel_type', { length: 20 })
    .notNull()
    .default('native'),
  // Семейство платформы для маршрутизации: 'ios' | 'android' | 'desktop'
  // Nullable для обратной совместимости со старыми записями
  platformFamily: varchar('platform_family', { length: 20 }),
  // Стабильный идентификатор установки (localStorage UUID для PWA)
  installationId: varchar('installation_id', { length: 255 }),
  // Endpoint активен и может принимать push-уведомления
  isActive: boolean('is_active').notNull().default(true),
  // Основной канал доставки для данного пользователя+платформа (вычисляется сервером)
  isPrimary: boolean('is_primary').notNull().default(false),
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
  metric: varchar('metric', { length: 50 }), // steps | breath | ... (training объединён со steps)
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
    textSource: varchar('text_source', { length: 20 }).notNull(), // 'ai' (только для AI-текстов)
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

// Ротация изображений уведомлений (персистентно, без частых повторов)
export const notificationImageRotation = pgTable(
  'notification_image_rotation',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    kind: varchar('kind', { length: 20 }).notNull(), // 'therapy' | 'habits'
    // Для кастомных сущностей используем специальный ключ '__custom__'
    entityKey: varchar('entity_key', { length: 255 }).notNull(),
    imageTag: varchar('image_tag', { length: 50 }).notNull(),
    lastIndex: integer('last_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userKindEntityTagUnique: unique(
      'notification_image_rotation_user_kind_entity_tag_unique'
    ).on(table.userId, table.kind, table.entityKey, table.imageTag),
  })
);

// Единая таблица для дефолтных и пользовательских текстов уведомлений
export const notificationTexts = pgTable('notification_texts', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'habits' | 'therapy'
  entityKey: text('entity_key').notNull(), // 'water', 'anxiety', кастомный id и т.п.
  userId: integer('user_id'), // NULL = системный дефолт, не NULL = пользовательский
  source: text('source').notNull(), // 'default' | 'user'
  intent: text('intent'), // 'build' | 'quit' (только habits, если нужно)
  subtype: text('subtype'), // 'reminder' | 'informational' | 'motivational' | 'mixed' | NULL
  imageTag: varchar('image_tag', { length: 50 }), // null = без картинки
  actionHint: text('action_hint'), // 'none' | 'meditation' | 'breathing'
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
  imageTag: varchar('image_tag', { length: 50 }), // null = без картинки
  actionHint: text('action_hint'), // 'none' | 'meditation' | 'breathing'
  directness: text('directness').notNull(), // 'soft' | 'moderate' | 'hard' | 'universal'
  addressing: text('addressing').notNull(), // 'informal' | 'formal' | 'universal'
  locale: text('locale').notNull(), // 'ru'
  text: text('text').notNull(), // сам текст
  sortOrder: integer('sort_order').notNull().default(0),
});

// === Subscription System ===

// Политики доступа к платным функциям (lock/paywall).
export const featureAccessPolicies = pgTable('feature_access_policies', {
  featureKey: text('feature_key').primaryKey(),
  requiredPlan: varchar('required_plan', { length: 20 }).notNull(), // basic | pro | premium
  trialUnlocked: boolean('trial_unlocked').default(false).notNull(),
  lockIcon: varchar('lock_icon', { length: 20 }).notNull(), // pro | premium
  paywallTitle: text('paywall_title').notNull(),
  paywallDescription: text('paywall_description').notNull(),
  paywallCtaText: text('paywall_cta_text').notNull(),
  paywallTargetPlan: varchar('paywall_target_plan', { length: 20 }).notNull(), // pro | premium
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
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
    paymentProvider: varchar('payment_provider', { length: 20 })
      .notNull()
      .default('yookassa'), // 'yookassa' | 'apple_iap'
    yookassaPaymentId: text('yookassa_payment_id'), // payment.id в YooKassa (если известен)
    // Apple In-App Purchase (StoreKit) данные (для дедупликации и отладки).
    appleTransactionId: text('apple_transaction_id'),
    appleOriginalTransactionId: text('apple_original_transaction_id'),
    appleProductId: text('apple_product_id'),
    appleEnvironment: varchar('apple_environment', { length: 20 }), // 'sandbox' | 'production'
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
    // Уникальность transactionId от Apple (Postgres допускает множество NULL)
    appleTransactionUnique: unique(
      'uk_user_subscriptions_apple_transaction_id'
    ).on(table.appleTransactionId),
  })
);

// Аудит Apple транзакций (StoreKit 2 / App Store Server API).
// Используется для дедупа, расследований refund/chargeback и связки originalTransactionId -> user.
export const appleTransactions = pgTable(
  'apple_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    originalTransactionId: text('original_transaction_id').notNull(),
    transactionId: text('transaction_id').notNull(),
    productId: text('product_id').notNull(),
    environment: varchar('environment', { length: 20 }).notNull(), // 'sandbox' | 'production'
    purchaseDate: timestamp('purchase_date', { withTimezone: true }),
    expiresDate: timestamp('expires_date', { withTimezone: true }),
    revocationDate: timestamp('revocation_date', { withTimezone: true }),
    storefront: varchar('storefront', { length: 2 }),
    appAccountToken: text('app_account_token'),
    signedPayload: text('signed_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    transactionUnique: unique('uk_apple_transactions_transaction_id').on(
      table.transactionId
    ),
    originalEnvironmentIdx: index('idx_apple_transactions_original_env').on(
      table.originalTransactionId,
      table.environment
    ),
    userCreatedIdx: index('idx_apple_transactions_user_created').on(
      table.userId,
      table.createdAt
    ),
  })
);

// Дедуп и аудит App Store Server Notifications v2.
export const appleNotificationEvents = pgTable(
  'apple_notification_events',
  {
    id: serial('id').primaryKey(),
    notificationUUID: varchar('notification_uuid', { length: 64 }).notNull(),
    notificationType: varchar('notification_type', { length: 80 }),
    notificationSubtype: varchar('notification_subtype', { length: 80 }),
    userId: integer('user_id').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    transactionId: text('transaction_id'),
    originalTransactionId: text('original_transaction_id'),
    processingStatus: varchar('processing_status', { length: 20 })
      .notNull()
      .default('received'), // received | processed | ignored | failed
    signedPayload: text('signed_payload').notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    notificationUuidUnique: unique(
      'uk_apple_notification_events_notification_uuid'
    ).on(table.notificationUUID),
    createdIdx: index('idx_apple_notification_events_created').on(
      table.createdAt
    ),
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
    clientSessionId: varchar('client_session_id', { length: 120 }),
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
    // Ускоряет переиспользование/закрытие session по client chatSessionId.
    userClientSessionIdx: index('idx_therapy_sessions_user_client_session').on(
      table.userId,
      table.clientSessionId
    ),
  })
);

// Техническая память активной текстовой therapySession.
// Здесь живет session-scoped previous_response_id и compact-state текущей цепочки.
export const chatSessionMemories = pgTable(
  'chat_session_memories',
  {
    therapySessionId: integer('therapy_session_id')
      .primaryKey()
      .references(() => therapySessions.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    previousResponseId: text('previous_response_id'),
    previousResponseExpiresAt: timestamp('previous_response_expires_at', {
      withTimezone: true,
    }),
    runtimeCompactSchemaVersion: integer('runtime_compact_schema_version'),
    runtimeCompactIv: text('runtime_compact_iv'),
    runtimeCompactCt: text('runtime_compact_ct'),
    runtimeCompactCursorMessageId: integer('runtime_compact_cursor_message_id'),
    chainTurnCount: integer('chain_turn_count').default(0).notNull(),
    pendingSoftCompaction: boolean('pending_soft_compaction')
      .default(false)
      .notNull(),
    lastObservedInputTokens: integer('last_observed_input_tokens'),
    lastObservedOutputTokens: integer('last_observed_output_tokens'),
    lastObservedTotalTokens: integer('last_observed_total_tokens'),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }),
    lastCompactedAt: timestamp('last_compacted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userUpdatedIdx: index('idx_chat_session_memories_user_updated_at').on(
      table.userId,
      table.updatedAt
    ),
  })
);

// Временный transcript активной text-session.
// Сообщения нужны только для runtime compaction и session-end summary, затем очищаются.
export const therapySessionMessages = pgTable(
  'therapy_session_messages',
  {
    id: serial('id').primaryKey(),
    therapySessionId: integer('therapy_session_id')
      .notNull()
      .references(() => therapySessions.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    turnIndex: integer('turn_index').notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    contentIv: text('content_iv').notNull(),
    contentCt: text('content_ct').notNull(),
    tokenCount: integer('token_count'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionTurnIdx: index('idx_therapy_session_messages_session_turn').on(
      table.therapySessionId,
      table.turnIndex,
      table.id
    ),
    userCreatedIdx: index('idx_therapy_session_messages_user_created_at').on(
      table.userId,
      table.createdAt
    ),
  })
);

export const realtimeVoiceSessions = pgTable(
  'realtime_voice_sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    therapySessionId: integer('therapy_session_id')
      .notNull()
      .references(() => therapySessions.id, { onDelete: 'cascade' }),
    chatSessionId: varchar('chat_session_id', { length: 120 }),
    status: varchar('status', { length: 20 }).notNull().default('created'),
    endReason: varchar('end_reason', { length: 40 }),
    provider: varchar('provider', { length: 40 }).notNull().default('openai'),
    providerModel: varchar('provider_model', { length: 120 }).notNull(),
    providerVoice: varchar('provider_voice', { length: 80 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').default(0).notNull(),
    userTurnsCount: integer('user_turns_count').default(0).notNull(),
    assistantTurnsCount: integer('assistant_turns_count').default(0).notNull(),
    interruptCount: integer('interrupt_count').default(0).notNull(),
    inputAudioSeconds: integer('input_audio_seconds').default(0).notNull(),
    outputAudioSeconds: integer('output_audio_seconds').default(0).notNull(),
    inputAudioTokens: integer('input_audio_tokens').default(0).notNull(),
    outputAudioTokens: integer('output_audio_tokens').default(0).notNull(),
    quotaPeriodKey: varchar('quota_period_key', { length: 80 }).notNull(),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessage: text('error_message'),
    clientPlatform: varchar('client_platform', { length: 20 })
      .notNull()
      .default('web'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userStartedIdx: index('idx_realtime_voice_sessions_user_started').on(
      table.userId,
      table.startedAt
    ),
    userStatusIdx: index('idx_realtime_voice_sessions_user_status').on(
      table.userId,
      table.status,
      table.startedAt
    ),
    therapySessionIdx: uniqueIndex(
      'uk_realtime_voice_sessions_therapy_session'
    ).on(table.therapySessionId),
    quotaPeriodIdx: index('idx_realtime_voice_sessions_quota_period').on(
      table.userId,
      table.quotaPeriodKey
    ),
  })
);

export const realtimeVoiceSessionEvents = pgTable(
  'realtime_voice_session_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: varchar('session_id', { length: 64 })
      .notNull()
      .references(() => realtimeVoiceSessions.id, { onDelete: 'cascade' }),
    eventId: varchar('event_id', { length: 120 }).notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    payloadJson: jsonb('payload_json').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueSessionEvent: uniqueIndex(
      'uk_realtime_voice_session_events_unique'
    ).on(table.sessionId, table.eventId),
    sessionOccurredIdx: index('idx_realtime_voice_session_events_occurred').on(
      table.sessionId,
      table.occurredAt
    ),
  })
);

// Оценки ответов ассистента (MVP feedback).
export const chatResponseFeedback = pgTable(
  'chat_response_feedback',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    therapySessionId: integer('therapy_session_id')
      .notNull()
      .references(() => therapySessions.id, { onDelete: 'cascade' }),
    sessionId: text('session_id'),
    // Клиентский id ассистент-сообщения (nanoid(21), оставляем запас).
    assistantMessageClientId: varchar('assistant_message_client_id', {
      length: 64,
    }).notNull(),
    rating: smallint('rating').notNull(), // -1 | 1
    topicCode: varchar('topic_code', { length: 40 }),
    comment: text('comment'),
    // Текст ответа ИИ, на который пользователь оставил оценку.
    assistantMessageText: text('assistant_message_text'),
    platform: varchar('platform', { length: 20 }).notNull().default('web'),
    timezone: varchar('timezone', { length: 100 }),
    locale: varchar('locale', { length: 8 }),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Одна оценка на сообщение ассистента в рамках одной therapy-сессии.
    uniqueUserSessionMessage: unique(
      'uk_chat_response_feedback_user_therapy_message'
    ).on(table.userId, table.therapySessionId, table.assistantMessageClientId),
    therapySessionCreatedIdx: index(
      'idx_chat_response_feedback_session_created'
    ).on(table.therapySessionId, table.createdAt),
    ratingCreatedIdx: index('idx_chat_response_feedback_rating_created').on(
      table.rating,
      table.createdAt
    ),
    topicCreatedIdx: index('idx_chat_response_feedback_topic_created').on(
      table.topicCode,
      table.createdAt
    ),
    ratingCheck: check(
      'chk_chat_response_feedback_rating',
      sql`${table.rating} in (-1, 1)`
    ),
    commentLengthCheck: check(
      'chk_chat_response_feedback_comment_length',
      sql`${table.comment} is null or length(${table.comment}) <= 1000`
    ),
    assistantMessageTextLengthCheck: check(
      'chk_chat_response_feedback_assistant_text_length',
      sql`${table.assistantMessageText} is null or length(${table.assistantMessageText}) <= 8000`
    ),
    topicByRatingCheck: check(
      'chk_chat_response_feedback_topic_by_rating',
      sql`(${table.rating} = 1 and ${table.topicCode} is null) or (${table.rating} = -1)`
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

// Лог доставок внутренних Telegram alerts.
export const telegramAlertDeliveries = pgTable(
  'telegram_alert_deliveries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    dedupKey: varchar('dedup_key', { length: 255 }).notNull(),
    targetChannel: varchar('target_channel', { length: 20 }).notNull(),
    environment: varchar('environment', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    source: varchar('source', { length: 100 }),
    payload: jsonb('payload'),
    eventCreatedAt: timestamp('event_created_at', { withTimezone: true }),
    attempt: integer('attempt').default(0).notNull(),
    errorMessage: text('error_message'),
    providerResponseCode: integer('provider_response_code'),
    providerRetryAfterSeconds: integer('provider_retry_after_seconds'),
    telegramMessageId: text('telegram_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    dedupKeyUnique: unique('uk_telegram_alert_deliveries_dedup_key').on(
      table.dedupKey
    ),
    createdAtIdx: index('idx_telegram_alert_deliveries_created_at').on(
      table.createdAt
    ),
    channelStatusIdx: index('idx_telegram_alert_deliveries_channel_status').on(
      table.targetChannel,
      table.status
    ),
  })
);

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

// Попытки списаний для trial-scheduled billing (идемпотентность + ретраи).
export const billingChargeAttempts = pgTable(
  'billing_charge_attempts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chargeAttemptKey: varchar('charge_attempt_key', { length: 255 }).notNull(),
    billingPlanId: varchar('billing_plan_id', { length: 50 })
      .notNull()
      .references(() => subscriptionPlans.id),
    billingPeriod: varchar('billing_period', { length: 10 }).notNull(), // 'month' | 'year'
    scheduledChargeAt: timestamp('scheduled_charge_at', {
      withTimezone: true,
    }).notNull(),
    status: varchar('status', { length: 20 }).notNull(), // 'processing' | 'success' | 'failed' | 'noop'
    providerPaymentId: text('provider_payment_id'),
    attemptCount: integer('attempt_count').default(0).notNull(),
    autoAttemptCount: integer('auto_attempt_count').default(0).notNull(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastAutoAttemptAt: timestamp('last_auto_attempt_at', {
      withTimezone: true,
    }),
    nextAutoRetryAt: timestamp('next_auto_retry_at', { withTimezone: true }),
    lockAt: timestamp('lock_at', { withTimezone: true }),
    lockBy: varchar('lock_by', { length: 100 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    chargeAttemptKeyUnique: unique('uk_billing_charge_attempt_key').on(
      table.chargeAttemptKey
    ),
    userStatusIdx: index('idx_billing_charge_attempts_user_status').on(
      table.userId,
      table.status
    ),
    nextRetryIdx: index('idx_billing_charge_attempts_next_retry').on(
      table.nextAutoRetryAt
    ),
  })
);

// Admin-created одноразовые промокампании.
export const promoCampaigns = pgTable(
  'promo_campaigns',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    campaignType: varchar('campaign_type', { length: 50 }).notNull(),
    bindingMode: varchar('binding_mode', { length: 20 })
      .notNull()
      .default('none'),
    targetUserId: integer('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    targetEmail: varchar('target_email', { length: 255 }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    benefitPayload: jsonb('benefit_payload').notNull().default({}),
    adminComment: text('admin_comment'),
    createdBy: integer('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedBy: integer('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    codeUnique: unique('uk_promo_campaigns_code').on(table.code),
    statusIdx: index('idx_promo_campaigns_status').on(table.status),
    startsEndsIdx: index('idx_promo_campaigns_dates').on(
      table.startsAt,
      table.endsAt
    ),
  })
);

// Факт успешного redeem одноразового промокода.
export const promoCodeRedemptions = pgTable(
  'promo_code_redemptions',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id')
      .notNull()
      .references(() => promoCampaigns.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('succeeded'),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    campaignSnapshot: jsonb('campaign_snapshot').notNull().default({}),
    resultPayload: jsonb('result_payload').default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    campaignUnique: unique('uk_promo_code_redemptions_campaign').on(
      table.campaignId
    ),
    userIdx: index('idx_promo_code_redemptions_user').on(table.userId),
  })
);

// Персональный referral-code пользователя и агрегаты по программе.
export const userReferralProfiles = pgTable(
  'user_referral_profiles',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    successfulInvitesCount: integer('successful_invites_count')
      .notNull()
      .default(0),
    pendingRewardsCount: integer('pending_rewards_count').notNull().default(0),
    blocked: boolean('blocked').notNull().default(false),
    lastRewardIssuedAt: timestamp('last_reward_issued_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    codeUnique: unique('uk_user_referral_profiles_code').on(table.code),
  })
);

// Глобальные настройки referral-программы.
export const referralProgramSettings = pgTable('referral_program_settings', {
  id: text('id').primaryKey().default('default'),
  enabled: boolean('enabled').notNull().default(true),
  inviteePercent: integer('invitee_percent').notNull().default(20),
  referrerPercent: integer('referrer_percent').notNull().default(20),
  inviteeRewardValidityDays: integer('invitee_reward_validity_days')
    .notNull()
    .default(30),
  creditHoldDays: integer('credit_hold_days').notNull().default(14),
  inviteeTargetPlanScope: varchar('invitee_target_plan_scope', {
    length: 20,
  })
    .notNull()
    .default('any_paid'),
  inviteeTargetPeriodScope: varchar('invitee_target_period_scope', {
    length: 10,
  })
    .notNull()
    .default('any'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Факт применения referral-кода invitee'ом.
export const referralRedemptions = pgTable(
  'referral_redemptions',
  {
    id: serial('id').primaryKey(),
    referrerUserId: integer('referrer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteeUserId: integer('invitee_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referralCode: varchar('referral_code', { length: 64 }).notNull(),
    status: varchar('status', { length: 30 })
      .notNull()
      .default('pending_conversion'),
    inviteeRewardGrantId: integer('invitee_reward_grant_id'),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    rewardIssuedAt: timestamp('reward_issued_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    inviteeUnique: unique('uk_referral_redemptions_invitee').on(
      table.inviteeUserId
    ),
    referrerIdx: index('idx_referral_redemptions_referrer').on(
      table.referrerUserId,
      table.redeemedAt
    ),
  })
);

// Ledger накопительных billing credits: pending, доступные и компенсационные движения.
export const billingCreditEntries = pgTable(
  'billing_credit_entries',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryType: varchar('entry_type', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('posted'),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    sourceReferralRedemptionId: integer(
      'source_referral_redemption_id'
    ).references(() => referralRedemptions.id, {
      onDelete: 'set null',
    }),
    sourceSubscriptionId: integer('source_subscription_id').references(
      () => userSubscriptions.id,
      {
        onDelete: 'set null',
      }
    ),
    sourcePaymentId: text('source_payment_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userStatusAvailableIdx: index(
      'idx_billing_credit_entries_user_status_available'
    ).on(table.userId, table.status, table.availableAt),
    referralIdx: index('idx_billing_credit_entries_referral').on(
      table.sourceReferralRedemptionId
    ),
    subscriptionIdx: index('idx_billing_credit_entries_subscription').on(
      table.sourceSubscriptionId
    ),
  })
);

// Временный access overlay поверх trial/paid-plan.
export const billingAccessGrants = pgTable(
  'billing_access_grants',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceCampaignId: integer('source_campaign_id').references(
      () => promoCampaigns.id,
      { onDelete: 'set null' }
    ),
    sourceRedemptionId: integer('source_redemption_id').references(
      () => promoCodeRedemptions.id,
      { onDelete: 'set null' }
    ),
    planId: varchar('plan_id', { length: 50 })
      .notNull()
      .references(() => subscriptionPlans.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userStatusEndsIdx: index('idx_billing_access_grants_user_status_ends').on(
      table.userId,
      table.status,
      table.endsAt
    ),
  })
);

// Будущая скидка на ближайший qualifying payment.
export const billingDiscountGrants = pgTable(
  'billing_discount_grants',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull().default('yookassa'),
    grantKind: varchar('grant_kind', { length: 30 }).notNull(),
    sourceCampaignId: integer('source_campaign_id').references(
      () => promoCampaigns.id,
      { onDelete: 'set null' }
    ),
    sourceRedemptionId: integer('source_redemption_id').references(
      () => promoCodeRedemptions.id,
      { onDelete: 'set null' }
    ),
    sourceReferralRedemptionId: integer(
      'source_referral_redemption_id'
    ).references(() => referralRedemptions.id, {
      onDelete: 'set null',
    }),
    bindingMode: varchar('binding_mode', { length: 20 })
      .notNull()
      .default('none'),
    targetPlanScope: varchar('target_plan_scope', { length: 20 })
      .notNull()
      .default('any_paid'),
    targetPeriodScope: varchar('target_period_scope', { length: 10 })
      .notNull()
      .default('any'),
    percent: integer('percent').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    reservationKey: varchar('reservation_key', { length: 255 }),
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedPaymentId: text('applied_payment_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userStatusExpiresIdx: index(
      'idx_billing_discount_grants_user_status_expires'
    ).on(table.userId, table.status, table.expiresAt),
    reservationIdx: index('idx_billing_discount_grants_reservation').on(
      table.reservationKey
    ),
  })
);

// Аудит "честного" сдвига платёжной границы при free access days.
export const billingScheduleAdjustments = pgTable(
  'billing_schedule_adjustments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    days: integer('days').notNull(),
    reason: varchar('reason', { length: 50 }).notNull(),
    sourceCampaignId: integer('source_campaign_id').references(
      () => promoCampaigns.id,
      { onDelete: 'set null' }
    ),
    sourceRedemptionId: integer('source_redemption_id').references(
      () => promoCodeRedemptions.id,
      { onDelete: 'set null' }
    ),
    sourceAccessGrantId: integer('source_access_grant_id').references(
      () => billingAccessGrants.id,
      { onDelete: 'set null' }
    ),
    activeSubscriptionId: integer('active_subscription_id').references(
      () => userSubscriptions.id,
      { onDelete: 'set null' }
    ),
    appliedAt: timestamp('applied_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userAppliedIdx: index('idx_billing_schedule_adjustments_user_applied').on(
      table.userId,
      table.appliedAt
    ),
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
    requestHash: text('request_hash').notNull().default(''), // хеш бизнес-payload команды
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

// Одноразовые токены для перехода из мобильной сессии в web cookie-сессию
export const externalAuthTokens = pgTable(
  'external_auth_tokens',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(), // хранится только хеш токена
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdIp: text('created_ip'),
    createdUserAgent: text('created_user_agent'),
    consumedIp: text('consumed_ip'),
    consumedUserAgent: text('consumed_user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    tokenHashUnique: unique('uk_external_auth_tokens_token_hash').on(
      table.tokenHash
    ),
    userExpiresIdx: index('idx_external_auth_tokens_user_expires').on(
      table.userId,
      table.expiresAt
    ),
    expiresIdx: index('idx_external_auth_tokens_expires').on(table.expiresAt),
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

// === App Version Policy ===

export const appVersionPolicy = pgTable('app_version_policy', {
  platform: varchar('platform', { length: 20 }).primaryKey(), // 'ios' | 'android'
  minimumSupportedBuild: integer('minimum_supported_build')
    .notNull()
    .default(1),
  storeUrl: text('store_url').notNull(),
  blockerTitle: text('blocker_title'),
  blockerMessage: text('blocker_message'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
});

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

// Пользовательские саммари сессий (редизайн главной, ТЗ п.5).
// Отдельная сущность от sessionSummaries (handoff для LLM): здесь — человекочитаемый
// итог для пользователя (shortSummary, keyPoints, recommendations, nextStep),
// зашифрованный AES-GCM (iv+ct base64). Не ломает обратную совместимость.
export const sessionSummariesUser = pgTable(
  'session_summaries_user',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Клиентский sessionId (если есть) — на случай, если therapy_sessions ещё нет.
    clientSessionId: varchar('client_session_id', { length: 120 }),
    // Ссылка на серверную сессию (может быть null, если саммари создано оффлайн/fallback).
    therapySessionId: integer('therapy_session_id').references(
      () => therapySessions.id,
      { onDelete: 'set null' }
    ),
    model: text('model'),
    schemaVersion: integer('schema_version').notNull().default(1),
    // Метаданные сессии — не чувствительны, хранятся открыто для сортировки/фильтрации.
    sessionStartedAt: timestamp('session_started_at', { withTimezone: true }),
    sessionEndedAt: timestamp('session_ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').default(0).notNull(),
    messagesCount: integer('messages_count').default(0).notNull(),
    userMessagesCount: integer('user_messages_count').default(0).notNull(),
    qualifyingUserMessagesCount: integer('qualifying_user_messages_count')
      .default(0)
      .notNull(),
    // Зашифрованный JSON: { shortSummary, keyPoints[], recommendations[], nextStep }.
    summaryIv: text('summary_iv'),
    summaryCt: text('summary_ct'),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | completed | failed
    errorMessage: text('error_message'),
    // Момент, когда пользователь увидел/закрыл модалку (для логики "непрочитанного итога").
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    // Trigger, породивший саммари: manual | logout | app-hidden | cron-nightly.
    trigger: varchar('trigger', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Один пользовательский итог на therapy session.
    therapySessionUnique: uniqueIndex(
      'uk_session_summaries_user_therapy_session_id'
    ).on(table.therapySessionId),
    userCreatedIdx: index('idx_session_summaries_user_user_created_at').on(
      table.userId,
      table.createdAt
    ),
    // Быстрый поиск непросмотренного итога пользователя.
    userViewedIdx: index('idx_session_summaries_user_user_viewed').on(
      table.userId,
      table.viewedAt
    ),
  })
);
