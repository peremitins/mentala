import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { chatSettings } from '@/server/infrastructure/db/schema';
import type { ChatEntryContext } from '@/shared/dto';
import type { Gender } from '@/shared/dto/onboarding';
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

const LATIN_SURNAME_SUFFIXES = ['ov', 'ev', 'in', 'sky', 'ski', 'son', 'sen'];

const NAME_VOWELS = /[AEIOUYАЕЁИОУЫЭЮЯ]/i;
const INVALID_NAME_CHARS = /[^A-Za-zА-Яа-яЁё-\s]/;
const MAX_OPENING_CACHE_SIZE = 5000;
const lastOpeningIndexByContext = new Map<string, number>();

// Нейтральные стартовые фразы используем только для входа в чат с главной.
const HOME_ALTERNATIVE_OPENINGS = [
  'Чем могу помочь прямо сейчас?',
  'Продолжим разговор или начнём новую тему?',
  'Что сейчас важнее всего для тебя?',
  'С чего тебе удобнее начать: с ситуации, мыслей или ощущений в теле?',
];

const THERAPY_FALLBACK_OPENINGS = [
  'Давай разберём эту тему. Что сейчас в ней самое тяжёлое?',
  'Начнём с главного: что в этой теме сейчас самое острое?',
  'С чего тебе важнее начать прямо сейчас?',
];

const HABIT_BUILD_FALLBACK_OPENINGS = [
  'Давай разберём эту привычку. Что сейчас мешает делать её регулярно?',
  'Что уже получается, а где чаще всего стопор?',
  'Хочешь, найдём самый маленький шаг, который реально сделать сегодня?',
];

const HABIT_QUIT_FALLBACK_OPENINGS = [
  'Что обычно запускает желание вернуться к ней?',
  'Какой момент дня для тебя самый сложный?',
  'Давай выберем один ближайший триггер и разберём его по шагам.',
];

// Варианты фразы по полу. Если пол не задан — используем нейтральную версию,
// чтобы не ошибаться в окончаниях и не показывать пользователю служебные формы.
type GenderedText = {
  neutral: string;
  male?: string;
  female?: string;
};

function pickGenderedText(text: GenderedText, gender: Gender | null): string {
  if (gender === 'male' && text.male) {
    return text.male;
  }
  if (gender === 'female' && text.female) {
    return text.female;
  }
  return text.neutral;
}

const SOS_OPENINGS: Record<'panic' | 'tension' | 'vent', GenderedText[]> = {
  panic: [
    {
      neutral: 'Спасибо, что ты здесь. Что сейчас пугает сильнее всего?',
      male: 'Спасибо, что написал. Что сейчас пугает сильнее всего?',
      female: 'Спасибо, что написала. Что сейчас пугает сильнее всего?',
    },
    {
      neutral:
        'Я рядом. Давай на минуту замедлимся: что происходит прямо сейчас?',
    },
    {
      neutral:
        'Что сейчас сильнее всего: ощущения в теле, мысли или сама ситуация?',
    },
  ],
  tension: [
    {
      neutral: 'Я рядом. Где в теле сейчас больше всего напряжения?',
    },
    {
      neutral: 'Что сейчас сильнее всего держит тебя в напряжении?',
    },
    {
      neutral: 'Если выбрать одно: что прямо сейчас хочется отпустить?',
    },
  ],
  vent: [
    {
      neutral: 'Я слушаю. С чего хочешь начать?',
    },
    {
      neutral:
        'Можно выговориться как есть. Что сейчас тяжелее всего держать внутри?',
    },
    {
      neutral: 'Расскажи, что происходит. Что сейчас давит сильнее всего?',
    },
  ],
};

function normalizeContextLabel(rawValue?: string | null): string | null {
  if (!rawValue || typeof rawValue !== 'string') {
    return null;
  }

  const normalized = rawValue.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 71)}…`;
}

function resolveContextSeedKey(entryContext?: ChatEntryContext | null): string {
  if (!entryContext) {
    return 'home';
  }

  if (entryContext.type === 'habit') {
    const name = normalizeContextLabel(entryContext.habit_name) || '';
    return `habit:${entryContext.habit_id}:${entryContext.habit_intent || ''}:${name}`;
  }

  if (entryContext.type === 'therapy_topic') {
    const name = normalizeContextLabel(entryContext.topic_name) || '';
    return `therapy_topic:${entryContext.topic_id}:${name}`;
  }

  return `sos:${entryContext.sos_entry}:${entryContext.after_practice ? '1' : '0'}`;
}

function pickRandomIndexExcludingPrevious(
  optionsCount: number,
  previousIndex?: number
): number {
  if (optionsCount <= 1) {
    return 0;
  }

  if (
    typeof previousIndex !== 'number' ||
    previousIndex < 0 ||
    previousIndex >= optionsCount
  ) {
    return Math.floor(Math.random() * optionsCount);
  }

  const next = Math.floor(Math.random() * (optionsCount - 1));
  return next >= previousIndex ? next + 1 : next;
}

function buildTherapyOpenings(
  context: Extract<ChatEntryContext, { type: 'therapy_topic' }>
): string[] {
  const topicLabel =
    normalizeContextLabel(context.topic_name) ||
    normalizeContextLabel(context.topic_description);

  if (!topicLabel) {
    return THERAPY_FALLBACK_OPENINGS;
  }

  return [
    `Давай поговорим о теме «${topicLabel}». Что сейчас в ней самое тяжёлое?`,
    `Про «${topicLabel}». Что больше всего беспокоит прямо сейчас?`,
    `С чего начнём в теме «${topicLabel}»: с ситуации, мыслей или ощущений в теле?`,
  ];
}

function buildHabitOpenings(
  context: Extract<ChatEntryContext, { type: 'habit' }>
): string[] {
  const habitLabel =
    normalizeContextLabel(context.habit_name) ||
    normalizeContextLabel(context.habit_description);

  const isQuit = context.habit_intent === 'quit';
  const fallbackOpenings = isQuit
    ? HABIT_QUIT_FALLBACK_OPENINGS
    : HABIT_BUILD_FALLBACK_OPENINGS;

  if (!habitLabel) {
    return fallbackOpenings;
  }

  if (isQuit) {
    return [
      `Давай разберём привычку «${habitLabel}». В какие моменты она включается чаще всего?`,
      `Про «${habitLabel}». Что обычно запускает желание вернуться к ней?`,
      `Хочешь, соберём план на один ближайший сложный момент?`,
    ];
  }

  return [
    `Давай разберём привычку «${habitLabel}». Что сейчас мешает делать её регулярно?`,
    `Про «${habitLabel}». Что уже получается, а где чаще всего стопор?`,
    `Хочешь, найдём самый маленький шаг по «${habitLabel}», который реально сделать сегодня?`,
  ];
}

function buildSosOpenings(
  context: Extract<ChatEntryContext, { type: 'sos' }>,
  userGender: Gender | null
): string[] {
  if (!context.after_practice) {
    return SOS_OPENINGS[context.sos_entry].map((text) =>
      pickGenderedText(text, userGender)
    );
  }

  if (context.sos_entry === 'panic') {
    return [
      'Что сейчас остаётся самым тревожным?',
      'Что тебе важно проговорить прямо сейчас, чтобы стало спокойнее?',
    ];
  }

  if (context.sos_entry === 'tension') {
    return [
      'Что сейчас держит в напряжении: мысли, ситуация или тело?',
      'Что поможет снизить напряжение в ближайшие 10 минут?',
    ];
  }

  return SOS_OPENINGS.vent.map((text) => pickGenderedText(text, userGender));
}

function resolveAlternativeOpenings(
  entryContext: ChatEntryContext | null | undefined,
  userGender: Gender | null
): string[] {
  // При входе из конкретного раздела старт должен сразу отражать выбранный контекст.
  if (!entryContext) {
    return HOME_ALTERNATIVE_OPENINGS;
  }

  if (entryContext.type === 'therapy_topic') {
    return buildTherapyOpenings(entryContext);
  }

  if (entryContext.type === 'habit') {
    return buildHabitOpenings(entryContext);
  }

  return buildSosOpenings(entryContext, userGender);
}

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

export function pickAlternativeOpening(params: {
  userId: number;
  timezone: string;
  sessionId?: string | null;
  entryContext?: ChatEntryContext | null;
  userGender?: Gender | null;
  now?: Date;
}): string {
  const openings = resolveAlternativeOpenings(
    params.entryContext,
    params.userGender ?? null
  );
  const contextKey = resolveContextSeedKey(params.entryContext);
  const cacheKey = `${params.userId}:${contextKey}`;
  const previousIndex = lastOpeningIndexByContext.get(cacheKey);
  const index = pickRandomIndexExcludingPrevious(
    openings.length,
    previousIndex
  );

  lastOpeningIndexByContext.set(cacheKey, index);

  // Ограничиваем рост in-memory кэша для долгоживущего процесса.
  if (lastOpeningIndexByContext.size > MAX_OPENING_CACHE_SIZE) {
    lastOpeningIndexByContext.clear();
  }

  return openings[index] || openings[0] || HOME_ALTERNATIVE_OPENINGS[0];
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
