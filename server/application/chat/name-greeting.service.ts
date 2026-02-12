import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { toZonedTime } from 'date-fns-tz';
import { db } from '@/server/infrastructure/db/client';
import { chatSettings } from '@/server/infrastructure/db/schema';
import {
  getStartOfLocalDayUtc,
  isValidTimezone,
} from '@/server/application/notifications/timezone.utils';

const STOP_WORDS = new Set([
  'user',
  'test',
  'admin',
  'guest',
  'anon',
  'anonymous',
  'bot',
  'none',
  'null',
  'undefined',
  'пользователь',
  'тест',
  'админ',
  'гость',
  'анон',
  'аноним',
  'бот',
]);

const CYRILLIC_SURNAME_SUFFIXES = [
  'ов',
  'ев',
  'ин',
  'ын',
  'ова',
  'ева',
  'ина',
  'ына',
  'ский',
  'ская',
  'цкий',
  'цкая',
  'ой',
  'ый',
  'ая',
  'енко',
  'ук',
  'юк',
  'ко',
  'ич',
  'вич',
  'ович',
  'евич',
];

const LATIN_SURNAME_SUFFIXES = [
  'ov',
  'ev',
  'in',
  'sky',
  'ski',
  'son',
  'sen',
];

const NAME_VOWELS = /[AEIOUYАЕЁИОУЫЭЮЯ]/i;
const INVALID_NAME_CHARS = /[^A-Za-zА-Яа-яЁё-\s]/;

const ALTERNATIVE_OPENINGS = [
  'Я здесь. Чем могу помочь сейчас?',
  'Я на связи. Хочешь продолжить или начать новую тему?',
  'Я рядом. О чем поговорим сейчас?',
  'Чем могу помочь прямо сейчас?',
  'Можем продолжить разговор, если хочешь.',
];

function looksLikeSurname(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    CYRILLIC_SURNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ||
    LATIN_SURNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  );
}

function formatNameCase(name: string): string {
  const parts = name.split('-');
  const formatted = parts.map((part) => {
    if (!part) return part;
    const isUpper = part === part.toUpperCase();
    const isLower = part === part.toLowerCase();
    if (isUpper || isLower) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
    return part.charAt(0).toUpperCase() + part.slice(1);
  });
  return formatted.join('-');
}

/**
 * Консервативно извлекает имя для приветствия.
 * Если есть сомнения — возвращает null.
 */
export function extractGreetingName(rawName?: string | null): string | null {
  if (!rawName || typeof rawName !== 'string') {
    return null;
  }

  const normalized = rawName.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  // Разрешаем только буквы, пробелы и дефис — всё остальное считаем никнеймом.
  if (INVALID_NAME_CHARS.test(normalized)) {
    return null;
  }

  const tokens = normalized
    .split(' ')
    .map((token) => token.replace(/^-+|-+$/g, ''))
    .filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  let candidate = tokens[0];
  if (tokens.length >= 2 && looksLikeSurname(tokens[0])) {
    candidate = tokens[1];
  }

  const lettersOnly = candidate.replace(/-/g, '');
  if (lettersOnly.length < 2 || lettersOnly.length > 32) {
    return null;
  }

  if (!NAME_VOWELS.test(candidate)) {
    return null;
  }

  if (STOP_WORDS.has(candidate.toLowerCase())) {
    return null;
  }

  return formatNameCase(candidate);
}

export function resolveUserTimezone(rawTimezone?: string | null): string {
  if (rawTimezone && isValidTimezone(rawTimezone)) {
    return rawTimezone;
  }
  return 'Europe/Moscow';
}

function getLocalDaySeed(date: Date, timezone: string): number {
  const local = toZonedTime(date, timezone);
  const startOfYear = Date.UTC(local.getFullYear(), 0, 0);
  const currentDay = Date.UTC(
    local.getFullYear(),
    local.getMonth(),
    local.getDate()
  );
  return Math.floor((currentDay - startOfYear) / 86_400_000);
}

export function pickAlternativeOpening(params: {
  userId: number;
  timezone: string;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const seed = getLocalDaySeed(now, params.timezone);
  const index =
    Math.abs(params.userId + seed) % ALTERNATIVE_OPENINGS.length;
  return ALTERNATIVE_OPENINGS[index];
}

/**
 * Резервирует право на приветствие (обычное) в текущий локальный день.
 * Возвращает true, если приветствие можно использовать.
 */
export async function reserveDailyGreeting(params: {
  userId: number;
  timezone: string;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const startOfDayUtc = getStartOfLocalDayUtc(now, params.timezone);

  const updated = await db
    .update(chatSettings)
    .set({ lastGreetingAt: now, updatedAt: now })
    .where(
      and(
        eq(chatSettings.userId, params.userId),
        or(
          isNull(chatSettings.lastGreetingAt),
          lt(chatSettings.lastGreetingAt, startOfDayUtc)
        )
      )
    )
    .returning({ userId: chatSettings.userId });

  if (updated.length > 0) {
    return true;
  }

  const inserted = await db
    .insert(chatSettings)
    .values({
      userId: params.userId,
      // Синхронизируем значения с DEFAULT_SETTINGS из storage.ts
      voice: true,
      avatar: false,
      enablePreviousResponseId: true,
      enableSummary: true,
      lastGreetingAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ userId: chatSettings.userId });

  return inserted.length > 0;
}

/**
 * Резервирует право на приветствие по имени в текущий локальный день.
 * Возвращает true, если приветствие можно использовать.
 */
export async function reserveDailyNameGreeting(params: {
  userId: number;
  timezone: string;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const startOfDayUtc = getStartOfLocalDayUtc(now, params.timezone);

  const updated = await db
    .update(chatSettings)
    .set({ lastNameGreetingAt: now, updatedAt: now })
    .where(
      and(
        eq(chatSettings.userId, params.userId),
        or(
          isNull(chatSettings.lastNameGreetingAt),
          lt(chatSettings.lastNameGreetingAt, startOfDayUtc)
        )
      )
    )
    .returning({ userId: chatSettings.userId });

  if (updated.length > 0) {
    return true;
  }

  const inserted = await db
    .insert(chatSettings)
    .values({
      userId: params.userId,
      // Синхронизируем значения с DEFAULT_SETTINGS из storage.ts
      voice: true,
      avatar: false,
      enablePreviousResponseId: true,
      enableSummary: true,
      lastNameGreetingAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ userId: chatSettings.userId });

  return inserted.length > 0;
}

export async function getDailyGreetingName(params: {
  userId: number;
  rawName?: string | null;
  timezone?: string | null;
  now?: Date;
}): Promise<string | null> {
  const greetingName = extractGreetingName(params.rawName);
  if (!greetingName) {
    return null;
  }

  const timezone = resolveUserTimezone(params.timezone);
  const reserved = await reserveDailyNameGreeting({
    userId: params.userId,
    timezone,
    now: params.now,
  });

  return reserved ? greetingName : null;
}
