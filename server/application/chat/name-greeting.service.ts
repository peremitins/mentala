import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../../infrastructure/db/client';
import { chatSettings } from '../../infrastructure/db/schema';
import { DEFAULT_ASSISTANT_VOICE_ID } from '../../../shared/constants/assistantVoiceCatalog';
import type { ChatEntryContext } from '../../../shared/dto';
import type { Gender } from '../../../shared/dto/onboarding';
import type { Addressing } from '../../../shared/dto/notifications';
import {
  getStartOfLocalDayUtc,
  isValidTimezone,
} from '../notifications/timezone.utils';
import {
  pickAddressingText,
  resolveAddressing,
} from '../../../shared/utils/addressing';

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
  // 'ина' намеренно исключён: совпадает с популярными женскими именами (Марина, Ирина, Арина, Полина и др.)
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
  {
    informal: 'Чем могу помочь прямо сейчас?',
    formal: 'Чем могу помочь прямо сейчас?',
  },
  {
    informal: 'Продолжим разговор или начнём новую тему?',
    formal: 'Продолжим разговор или начнём новую тему?',
  },
  {
    informal: 'Что сейчас важнее всего для тебя?',
    formal: 'Что сейчас важнее всего для вас?',
  },
  {
    informal:
      'С чего тебе удобнее начать: с ситуации, мыслей или ощущений в теле?',
    formal:
      'С чего вам удобнее начать: с ситуации, мыслей или ощущений в теле?',
  },
];

const THERAPY_FALLBACK_OPENINGS = [
  {
    informal: 'Давай разберём эту тему. Что сейчас в ней самое тяжёлое?',
    formal: 'Давайте разберём эту тему. Что сейчас в ней самое тяжёлое?',
  },
  {
    informal: 'Начнём с главного: что в этой теме сейчас самое острое?',
    formal: 'Начнём с главного: что в этой теме сейчас самое острое?',
  },
  {
    informal: 'С чего тебе важнее начать прямо сейчас?',
    formal: 'С чего вам важнее начать прямо сейчас?',
  },
];

const HABIT_BUILD_FALLBACK_OPENINGS = [
  {
    informal:
      'Давай разберём эту привычку. Что сейчас мешает делать её регулярно?',
    formal:
      'Давайте разберём эту привычку. Что сейчас мешает делать её регулярно?',
  },
  {
    informal: 'Что уже получается, а где чаще всего стопор?',
    formal: 'Что уже получается, а где чаще всего возникает стопор?',
  },
  {
    informal:
      'Хочешь, найдём самый маленький шаг, который реально сделать сегодня?',
    formal:
      'Хотите, найдём самый маленький шаг, который реально сделать сегодня?',
  },
];

const HABIT_QUIT_FALLBACK_OPENINGS = [
  {
    informal: 'Что обычно запускает желание вернуться к ней?',
    formal: 'Что обычно запускает желание вернуться к ней?',
  },
  {
    informal: 'Какой момент дня для тебя самый сложный?',
    formal: 'Какой момент дня для вас самый сложный?',
  },
  {
    informal: 'Давай выберем один ближайший триггер и разберём его по шагам.',
    formal: 'Давайте выберем один ближайший триггер и разберём его по шагам.',
  },
];

// Варианты фразы по полу. Если пол не задан — используем нейтральную версию,
// чтобы не ошибаться в окончаниях и не показывать пользователю служебные формы.
type GenderedText = {
  neutral: string;
  male?: string;
  female?: string;
};

type AddressedGenderedText = {
  informal: GenderedText;
  formal: GenderedText;
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

function pickAddressedGenderedText(
  text: AddressedGenderedText,
  gender: Gender | null,
  addressing: Addressing
): string {
  return pickGenderedText(text[resolveAddressing(addressing)], gender);
}

const SOS_OPENINGS: Record<
  'panic' | 'tension' | 'vent',
  AddressedGenderedText[]
> = {
  panic: [
    {
      informal: {
        neutral: 'Спасибо, что ты здесь. Что сейчас пугает сильнее всего?',
        male: 'Спасибо, что написал. Что сейчас пугает сильнее всего?',
        female: 'Спасибо, что написала. Что сейчас пугает сильнее всего?',
      },
      formal: {
        neutral: 'Спасибо, что вы здесь. Что сейчас пугает сильнее всего?',
        male: 'Спасибо, что написали. Что сейчас пугает сильнее всего?',
        female: 'Спасибо, что написали. Что сейчас пугает сильнее всего?',
      },
    },
    {
      informal: {
        neutral:
          'Я рядом. Давай на минуту замедлимся: что происходит прямо сейчас?',
      },
      formal: {
        neutral:
          'Я рядом. Давайте на минуту замедлимся: что происходит прямо сейчас?',
      },
    },
    {
      informal: {
        neutral:
          'Что сейчас сильнее всего: ощущения в теле, мысли или сама ситуация?',
      },
      formal: {
        neutral:
          'Что сейчас сильнее всего: ощущения в теле, мысли или сама ситуация?',
      },
    },
  ],
  tension: [
    {
      informal: {
        neutral: 'Я рядом. Где в теле сейчас больше всего напряжения?',
      },
      formal: {
        neutral: 'Я рядом. Где в теле сейчас больше всего напряжения?',
      },
    },
    {
      informal: {
        neutral: 'Что сейчас сильнее всего держит тебя в напряжении?',
      },
      formal: {
        neutral: 'Что сейчас сильнее всего держит вас в напряжении?',
      },
    },
    {
      informal: {
        neutral: 'Если выбрать одно: что прямо сейчас хочется отпустить?',
      },
      formal: {
        neutral: 'Если выбрать одно: что прямо сейчас хочется отпустить?',
      },
    },
  ],
  vent: [
    {
      informal: {
        neutral: 'Я слушаю. С чего хочешь начать?',
      },
      formal: {
        neutral: 'Я слушаю. С чего хотите начать?',
      },
    },
    {
      informal: {
        neutral:
          'Можно выговориться как есть. Что сейчас тяжелее всего держать внутри?',
      },
      formal: {
        neutral:
          'Можно выговориться как есть. Что сейчас тяжелее всего держать внутри?',
      },
    },
    {
      informal: {
        neutral: 'Расскажи, что происходит. Что сейчас давит сильнее всего?',
      },
      formal: {
        neutral: 'Расскажите, что происходит. Что сейчас давит сильнее всего?',
      },
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

  if (entryContext.type === 'thought_dump') {
    const dumpSeed = normalizeContextLabel(entryContext.dump_text) || '';
    return `thought_dump:${entryContext.source}:${dumpSeed}`;
  }

  if (entryContext.type === 'sos') {
    return `sos:${entryContext.sos_entry}:${entryContext.after_practice ? '1' : '0'}`;
  }

  return 'home';
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
  context: Extract<ChatEntryContext, { type: 'therapy_topic' }>,
  addressing: Addressing
): string[] {
  const topicLabel =
    normalizeContextLabel(context.topic_name) ||
    normalizeContextLabel(context.topic_description);

  if (!topicLabel) {
    return THERAPY_FALLBACK_OPENINGS.map((text) =>
      pickAddressingText(addressing, text)
    );
  }

  return [
    pickAddressingText(addressing, {
      informal: `Давай поговорим о теме «${topicLabel}». Что сейчас в ней самое тяжёлое?`,
      formal: `Давайте поговорим о теме «${topicLabel}». Что сейчас в ней самое тяжёлое?`,
    }),
    pickAddressingText(addressing, {
      informal: `Про «${topicLabel}». Что больше всего беспокоит прямо сейчас?`,
      formal: `Про «${topicLabel}». Что больше всего беспокоит прямо сейчас?`,
    }),
    pickAddressingText(addressing, {
      informal: `С чего начнём в теме «${topicLabel}»: с ситуации, мыслей или ощущений в теле?`,
      formal: `С чего начнём в теме «${topicLabel}»: с ситуации, мыслей или ощущений в теле?`,
    }),
  ];
}

function buildHabitOpenings(
  context: Extract<ChatEntryContext, { type: 'habit' }>,
  addressing: Addressing
): string[] {
  const habitLabel =
    normalizeContextLabel(context.habit_name) ||
    normalizeContextLabel(context.habit_description);

  const isQuit = context.habit_intent === 'quit';
  const fallbackOpenings = isQuit
    ? HABIT_QUIT_FALLBACK_OPENINGS
    : HABIT_BUILD_FALLBACK_OPENINGS;

  if (!habitLabel) {
    return fallbackOpenings.map((text) => pickAddressingText(addressing, text));
  }

  if (isQuit) {
    return [
      pickAddressingText(addressing, {
        informal: `Давай разберём привычку «${habitLabel}». В какие моменты она включается чаще всего?`,
        formal: `Давайте разберём привычку «${habitLabel}». В какие моменты она включается чаще всего?`,
      }),
      pickAddressingText(addressing, {
        informal: `Про «${habitLabel}». Что обычно запускает желание вернуться к ней?`,
        formal: `Про «${habitLabel}». Что обычно запускает желание вернуться к ней?`,
      }),
      pickAddressingText(addressing, {
        informal: 'Хочешь, соберём план на один ближайший сложный момент?',
        formal: 'Хотите, соберём план на один ближайший сложный момент?',
      }),
    ];
  }

  return [
    pickAddressingText(addressing, {
      informal: `Давай разберём привычку «${habitLabel}». Что сейчас мешает делать её регулярно?`,
      formal: `Давайте разберём привычку «${habitLabel}». Что сейчас мешает делать её регулярно?`,
    }),
    pickAddressingText(addressing, {
      informal: `Про «${habitLabel}». Что уже получается, а где чаще всего стопор?`,
      formal: `Про «${habitLabel}». Что уже получается, а где чаще всего возникает стопор?`,
    }),
    pickAddressingText(addressing, {
      informal: `Хочешь, найдём самый маленький шаг по «${habitLabel}», который реально сделать сегодня?`,
      formal: `Хотите, найдём самый маленький шаг по «${habitLabel}», который реально сделать сегодня?`,
    }),
  ];
}

function buildSosOpenings(
  context: Extract<ChatEntryContext, { type: 'sos' }>,
  userGender: Gender | null,
  addressing: Addressing
): string[] {
  if (!context.after_practice) {
    return SOS_OPENINGS[context.sos_entry].map((text) =>
      pickAddressedGenderedText(text, userGender, addressing)
    );
  }

  if (context.sos_entry === 'panic') {
    return [
      pickAddressingText(addressing, {
        informal: 'Что сейчас остаётся самым тревожным?',
        formal: 'Что сейчас остаётся самым тревожным?',
      }),
      pickAddressingText(addressing, {
        informal:
          'Что тебе важно проговорить прямо сейчас, чтобы стало спокойнее?',
        formal:
          'Что вам важно проговорить прямо сейчас, чтобы стало спокойнее?',
      }),
    ];
  }

  if (context.sos_entry === 'tension') {
    return [
      pickAddressingText(addressing, {
        informal: 'Что сейчас держит в напряжении: мысли, ситуация или тело?',
        formal: 'Что сейчас держит в напряжении: мысли, ситуация или тело?',
      }),
      pickAddressingText(addressing, {
        informal: 'Что поможет снизить напряжение в ближайшие 10 минут?',
        formal: 'Что поможет снизить напряжение в ближайшие 10 минут?',
      }),
    ];
  }

  return SOS_OPENINGS.vent.map((text) =>
    pickAddressedGenderedText(text, userGender, addressing)
  );
}

function buildThoughtDumpOpenings(): string[] {
  // Для входа после «Выгрузки мыслей» не используем фиксированные стартовые фразы.
  // Считаем, что достаточно переданного контекста, а первую реплику сформирует LLM.
  return [];
}

function resolveAlternativeOpenings(
  entryContext: ChatEntryContext | null | undefined,
  userGender: Gender | null,
  addressing: Addressing
): string[] {
  // При входе из конкретного раздела старт должен сразу отражать выбранный контекст.
  if (!entryContext) {
    return HOME_ALTERNATIVE_OPENINGS.map((text) =>
      pickAddressingText(addressing, text)
    );
  }

  if (entryContext.type === 'therapy_topic') {
    return buildTherapyOpenings(entryContext, addressing);
  }

  if (entryContext.type === 'habit') {
    return buildHabitOpenings(entryContext, addressing);
  }

  if (entryContext.type === 'thought_dump') {
    return buildThoughtDumpOpenings();
  }

  if (entryContext.type === 'sos') {
    return buildSosOpenings(entryContext, userGender, addressing);
  }

  return HOME_ALTERNATIVE_OPENINGS.map((text) =>
    pickAddressingText(addressing, text)
  );
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

  // Ищем первый токен, который проходит базовую валидацию и не похож на фамилию.
  // Это позволяет корректно обрабатывать любой порядок: «Имя Фамилия»,
  // «Фамилия Имя», «Фамилия Имя Отчество», и т.д.
  for (const token of tokens) {
    const lettersOnly = token.replace(/-/g, '');
    if (lettersOnly.length < 2 || lettersOnly.length > 32) continue;
    if (!NAME_VOWELS.test(token)) continue;
    if (STOP_WORDS.has(token.toLowerCase())) continue;
    if (looksLikeSurname(token)) continue;
    return formatNameCase(token);
  }

  // Все токены похожи на фамилии или не прошли валидацию — не обращаемся по имени.
  return null;
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
  addressing?: Addressing;
  sessionId?: string | null;
  entryContext?: ChatEntryContext | null;
  userGender?: Gender | null;
  now?: Date;
}): string {
  const resolvedAddressing = resolveAddressing(params.addressing);
  const openings = resolveAlternativeOpenings(
    params.entryContext,
    params.userGender ?? null,
    resolvedAddressing
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

  // Возвращаем уже адресованный текст, а не сырой объект из константы.
  const fallbackOpening = pickAddressingText(
    resolvedAddressing,
    HOME_ALTERNATIVE_OPENINGS[0]!
  );

  return openings[index] ?? openings[0] ?? fallbackOpening;
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
      assistantVoice: DEFAULT_ASSISTANT_VOICE_ID,
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
      assistantVoice: DEFAULT_ASSISTANT_VOICE_ID,
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
