/**
 * Shared DTOs для системы уведомлений
 * Используется на клиенте и сервере
 */

// ==========================================
// Базовые типы
// ==========================================

export type NotificationKind = 'therapy' | 'habits';
export type Addressing = 'informal' | 'formal';
export type Tone =
  | 'delicate'
  | 'neutral'
  | 'uplifting'
  | 'resolute'
  | 'demanding';
export type Directness = 'soft' | 'moderate' | 'hard';
export type Platform = 'ios' | 'android' | 'web';
export type SlotStatus = 'planned' | 'sent' | 'skipped' | 'failed';
export type InteractionAction =
  | 'yes'
  | 'no'
  | 'later'
  | 'dismissed'
  | 'unanswered';
export type SnoozeDuration = '15m' | '1h' | '4h' | 'tomorrow';
export type HabitIntent = 'build' | 'quit' | 'custom';
export type HabitSubtype =
  | 'reminder'
  | 'informational'
  | 'motivational'
  | 'mixed';

// ==========================================
// Глобальные настройки пользователя
// ==========================================

export interface UserPreferencesDto {
  addressing: Addressing;
  tone: Tone;
}

export interface UpdateUserPreferencesDto {
  addressing?: Addressing;
  tone?: Tone;
}

// ==========================================
// Локальные настройки уведомлений
// ==========================================

export interface NotificationPreferencesDto {
  id: string;
  userId: number;
  kind: NotificationKind;
  habitId?: string | null;
  topicKey?: string | null; // Для therapy: anxiety, stress, mood, etc.
  enabled: boolean;
  timesPerDay: number;
  directness: Directness;
  timezone: string;
  subtype?: HabitSubtype | null; // Для habits: reminder | informational | motivational
  activeDays: number[]; // Дни недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
  customSlotTimes?: (number | null)[] | null; // Индивидуальные времена слотов (0-1439 минут) для каждого уведомления
  timeRangeStart: number; // Начало временного окна в минутах от начала дня (0-1439)
  timeRangeEnd: number; // Конец временного окна в минутах от начала дня (0-1439)
  meta?: Record<string, any> | null; // Дополнительные параметры (techniques и т.д.)
  createdAt: string;
  updatedAt: string;
}

export interface UpdateNotificationPreferencesDto {
  enabled?: boolean;
  timesPerDay?: number;
  directness?: Directness;
  timezone?: string;
  habitId?: string | null;
  topicKey?: string | null;
  subtype?: HabitSubtype | null;
  activeDays?: number[]; // Дни недели (0 = Воскресенье, 1 = Понедельник, ..., 6 = Суббота)
  customSlotTimes?: (number | null)[] | null; // Пользовательские времена слотов (0-1439 минут)
  timeRangeStart?: number; // Начало временного окна в минутах от начала дня (0-1439)
  timeRangeEnd?: number; // Конец временного окна в минутах от начала дня (0-1439)
  meta?: Record<string, any> | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateHabitDto {
  name: string;
  intent: HabitIntent;
  habitKey?: string; // Опционально, для каталога
  emoji?: string;
}

export interface UpdateHabitDto {
  name?: string;
  intent?: HabitIntent;
  habitKey?: string;
  emoji?: string;
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

// ==========================================
// Слоты уведомлений
// ==========================================

export interface NotificationSlotDto {
  id: string;
  userId: number;
  kind: NotificationKind;
  habitId?: string | null;
  topicKey?: string | null; // Для therapy: anxiety, stress, mood, etc.
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
  templateId?: string;
  action: string; // 'open' | 'snooze:15m' | 'snooze:1h' | ...
  deepLink?: string;
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
  habitId?: string | null;
}

// ==========================================
// Тестовая отправка
// ==========================================

export interface TestNotificationDto {
  kind: NotificationKind;
  habitId?: string | null;
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
