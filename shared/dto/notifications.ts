/**
 * Shared DTOs для системы уведомлений
 * Используется на клиенте и сервере
 */

// ==========================================
// Базовые типы
// ==========================================

export const MAX_NOTIFICATION_TEXT_LENGTH = 150;
export const MAX_CUSTOM_PROMPT_NOTIFICATION_LENGTH = 400;

export type NotificationKind = 'therapy' | 'habits';
export type NotificationTextSource = 'default' | 'user';
export type Addressing = 'informal' | 'formal';
export type Tone =
  | 'delicate'
  | 'neutral'
  | 'uplifting'
  | 'resolute'
  | 'demanding'
  | 'unknown';
export type Directness = 'soft' | 'moderate' | 'hard';
export type Platform = 'ios' | 'android' | 'web';
export type SlotStatus = 'planned' | 'sent' | 'skipped' | 'failed';
export type InteractionAction =
  | 'yes'
  | 'no'
  | 'later'
  | 'open'
  | 'dismissed'
  | 'unanswered';
export type SnoozeDuration = '15m' | '1h' | '4h' | 'tomorrow';
export type HabitIntent = 'build' | 'quit' | 'custom';
// Intent для текстов уведомлений (только 'build' | 'quit', без 'custom')
export type NotificationTextIntent = 'build' | 'quit';
export type NotificationImageTag =
  | 'harm_organs'
  | 'harm_appearance'
  | 'harm_mental'
  | 'activity'
  | 'nature'
  | 'meditation'
  | 'daily_life'
  | 'neutral_abstract';
// Универсальный тип subtype для всех видов уведомлений
export type NotificationSubtype =
  | 'reminder'
  | 'informational'
  | 'motivational'
  | 'mixed';

export type NotificationActionHint = 'none' | 'meditation' | 'breathing';

export type NotificationNavigation =
  | { type: 'home' }
  | { type: 'meditation_track'; trackId: string }
  | { type: 'breath_practices' }
  | { type: 'breath_practice'; slug: string };

// Обратная совместимость
export type HabitSubtype = NotificationSubtype;

// ==========================================
// Глобальные настройки пользователя
// ==========================================

export interface UserPreferencesDto {
  addressing: Addressing;
  tone: Tone;
  meditationTimerMinutes?: number | null;
}

export interface UpdateUserPreferencesDto {
  addressing?: Addressing;
  tone?: Tone;
  meditationTimerMinutes?: number | null;
}

// ==========================================
// Локальные настройки уведомлений
// ==========================================

export interface NotificationPreferencesDto {
  id: string;
  userId: number;
  kind: NotificationKind;
  entityKey?: string | null; // Единое поле для идентификации источника (ID для кастомных, ключ шаблона для шаблонных)
  enabled: boolean;
  timesPerDay: number;
  directness: Directness;
  timezone: string;
  subtype?: NotificationSubtype | null; // Для habits и therapy: reminder | informational | motivational | mixed
  activeDays: number[]; // Дни недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
  customSlotTimes?: (number | null)[] | null; // Индивидуальные времена слотов (0-1439 минут) для каждого уведомления
  timeRangeStart: number; // Начало временного окна в минутах от начала дня (0-1439)
  timeRangeEnd: number; // Конец временного окна в минутах от начала дня (0-1439)
  customPromptNotification?: string | null; // Персональные пожелания (только для шаблонных тем и AI)
  meta?: NotificationPreferenceMeta | null; // Дополнительные параметры (textSource и т.д.)
  createdAt: string;
  updatedAt: string;
}

export interface UpdateNotificationPreferencesDto {
  enabled?: boolean;
  timesPerDay?: number;
  directness?: Directness;
  timezone?: string;
  entityKey?: string | null; // Единое поле для идентификации источника (ID для кастомных, ключ шаблона для шаблонных)
  subtype?: NotificationSubtype | null;
  activeDays?: number[]; // Дни недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
  customSlotTimes?: (number | null)[] | null; // Пользовательские времена слотов (0-1439 минут)
  timeRangeStart?: number; // Начало временного окна в минутах от начала дня (0-1439)
  timeRangeEnd?: number; // Конец временного окна в минутах от начала дня (0-1439)
  customPromptNotification?: string | null; // Персональные пожелания (только для шаблонных тем и AI)
  meta?: NotificationPreferenceMeta | null;
  // Поля для обновления названия и описания кастомных привычек/терапии
  name?: string; // Новое название (только для кастомных привычек/терапии)
  description?: string | null; // Новое описание (только для кастомных привычек/терапии)
}

// ==========================================
// Привычки
// ==========================================

export interface HabitDto {
  id: string;
  name: string;
  intent: HabitIntent;
  habitKey?: string | null; // Нормализованный ключ для маппинга на шаблоны
  emoji?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHabitDto {
  name: string;
  intent: HabitIntent;
  habitKey?: string; // Опционально, для каталога
  emoji?: string;
  description?: string;
}

export interface UpdateHabitDto {
  name?: string;
  intent?: HabitIntent;
  habitKey?: string;
  emoji?: string;
  description?: string | null;
}

export interface NotificationPreferenceMeta {
  // Единое поле для всех типов сущностей (кастомные и шаблоны)
  textSource?: 'templates' | 'ai';
}

// Единый формат элемента уведомления (AI и шаблоны)
export interface NotificationItem {
  text: string;
  imageTag: NotificationImageTag | null;
  subtype: NotificationSubtype | null;
  actionHint: NotificationActionHint | null;
}

// ==========================================
// Тексты уведомлений
// ==========================================

export interface NotificationText {
  id: string;
  kind: NotificationKind;
  entityKey: string;
  userId: number | null;
  source: NotificationTextSource;
  intent: NotificationTextIntent | null;
  subtype: NotificationSubtype | null;
  imageTag: NotificationImageTag | null;
  actionHint: NotificationActionHint | null;
  directness: 'soft' | 'moderate' | 'hard' | 'universal';
  addressing: 'informal' | 'formal' | 'universal';
  locale: string; // 'ru'
  text: string;
  sortOrder: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BatchTextChanges {
  updated?: Array<{
    id: string;
    text?: string;
    imageTag?: NotificationImageTag | null;
    sortOrder?: number;
  }>;
  created?: Array<{
    tempId?: string;
    intent?: 'build' | 'quit' | null;
    subtype?: 'reminder' | 'informational' | 'motivational' | 'mixed' | null;
    imageTag?: NotificationImageTag | null;
    directness: 'soft' | 'moderate' | 'hard' | 'universal';
    // addressing больше не передается с фронта, берется из userPreferences на бэкенде
    locale: string;
    text: string;
  }>;
  deleted?: Array<{
    id: string;
  }>;
}

export interface BatchTextsRequest {
  kind: NotificationKind;
  entityKey: string;
  changes: BatchTextChanges;
}

export interface ResetTextsRequest {
  kind: NotificationKind;
  entityKey: string;
  keepUserTexts: boolean;
}

export interface ResetTextsResponse {
  restoredDefaults: number;
  userTextsKept: boolean;
}

// ==========================================
// Пользовательские темы терапии
// ==========================================

export interface TherapyTopicDto {
  id: string;
  name: string;
  description?: string | null;
  emoji?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTherapyTopicDto {
  name: string;
  description?: string;
  emoji?: string;
}

export interface UpdateTherapyTopicDto {
  name?: string;
  description?: string | null;
  emoji?: string | null;
}

// ==========================================
// Устройства пользователя (FCM токены)
// ==========================================

export interface UserDeviceDto {
  id: string;
  userId: number;
  token: string;
  platform: Platform;
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterTokenDto {
  token: string;
  platform: Platform;
}

export interface UnregisterTokenDto {
  token: string;
}

// ==========================================
// Слоты уведомлений
// ==========================================

export interface NotificationSlotDto {
  id: string;
  userId: number;
  kind: NotificationKind;
  entityKey?: string | null; // Единое поле для идентификации источника (ID для кастомных, ключ шаблона для шаблонных)
  scheduledAt: string;
  payload: NotificationPayload;
  templateId?: string | null;
  status: SlotStatus;
  snoozedUntil?: string | null;
  createdAt: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  image?: string; // URL большого изображения для уведомлений (Android 7+, iOS)
  templateId?: string;
  action: string; // 'open' | 'snooze:15m' | 'snooze:1h' | ...
  deepLink?: string;
  navigation?: NotificationNavigation;
  data?: Record<string, any>;
}

// ==========================================
// Взаимодействия с уведомлениями
// ==========================================

export interface NotificationInteractionDto {
  id: string;
  slotId: string;
  userId: number;
  action: InteractionAction;
  actionAt: string;
  meta?: Record<string, any> | null;
  kind: NotificationKind;
  type?: string | null;
  metric?: string | null;
  createdAt: string;
}

export interface CreateInteractionDto {
  slotId: string;
  action: InteractionAction;
  at?: string; // ISO timestamp
  meta?: Record<string, any>;
}

// ==========================================
// Snooze
// ==========================================

export interface SnoozeRequestDto {
  kind: NotificationKind;
  duration: SnoozeDuration;
  entityKey?: string | null;
}

// ==========================================
// Тестовая отправка
// ==========================================

export interface TestNotificationDto {
  kind: NotificationKind;
  entityKey?: string | null; // Единое поле для идентификации источника
}

// ==========================================
// Статистика и метрики
// ==========================================

export interface DailyAdherenceDto {
  id: string;
  userId: number;
  date: string; // 'YYYY-MM-DD'
  kind: NotificationKind;
  asked: number;
  yes: number;
  no: number;
  later: number;
  dismissed: number;
  unanswered: number;
  completionRate: string; // '0.0' - '1.0'
  streak: number;
  createdAt: string;
  updatedAt: string;
}

export interface MetricsSummaryDto {
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
  kind: NotificationKind;
  totalAsked: number;
  totalYes: number;
  totalNo: number;
  totalLater: number;
  totalDismissed: number;
  totalUnanswered: number;
  averageCompletionRate: number;
  currentStreak: number;
  maxStreak: number;
  dailyPoints: DailyMetricPoint[];
}

export interface DailyMetricPoint {
  date: string; // 'YYYY-MM-DD'
  asked: number;
  yes: number;
  completionRate: number;
}

export interface MetricsQueryDto {
  window: '7d' | '30d';
  kind?: NotificationKind;
}

// ==========================================
// Конфигурация системы (для будущего)
// ==========================================

export interface NotificationConfigDto {
  dailyCap: number;
  perHourCap: number;
  minGapMinutes: number;
  priority: NotificationKind[];
  awakeWindowStart: string; // '09:00'
  awakeWindowEnd: string; // '22:30'
  randomizeWindowMin: number; // джиттер в минутах
  maxTimesPerDay: number;
}
