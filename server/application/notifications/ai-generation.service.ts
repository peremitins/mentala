/**
 * Сервис для генерации AI-текстов уведомлений
 */

import {
  chatViaProvider,
  estimateCostUSD,
} from '@@/server/application/llm.service';
import { config } from '@@/server/config';
import { db } from '@@/server/infrastructure/db/client';
import {
  aiGeneratedNotificationTexts,
  aiNotificationTextUsage,
  habits,
  therapyTopicsCustom,
  users,
  userPreferences,
} from '@@/server/infrastructure/db/schema';
import { computeGenerationConfigHash } from '@@/server/utils/notification-ai-config-hash';
import { eq, and, sql, lte } from 'drizzle-orm';
import { enqueueAiTextPoolRefillJob } from '@@/server/application/notifications/queues/aiTextPool.queue';
import { createHash } from 'node:crypto';
import type { LlmProviderPort } from '@@/server/ports';
import type {
  Tone,
  Addressing,
  Directness,
  HabitSubtype,
  NotificationSubtype,
  NotificationActionHint,
} from '@/shared/dto/notifications';
import { MAX_NOTIFICATION_TEXT_LENGTH } from '@/shared/dto/notifications';

// Константы для генерации текстов уведомлений
const DEFAULT_TEXT_COUNT =
  Number(
    process.env.NUXT_AI_NOTIFICATIONS_DEFAULT_COUNT ||
      process.env.AI_NOTIFICATIONS_DEFAULT_COUNT
  ) || 50;
const MAX_OUTPUT_TOKENS_CAP =
  Number(
    process.env.NUXT_AI_NOTIFICATIONS_MAX_OUTPUT_TOKENS ||
      process.env.AI_NOTIFICATIONS_MAX_OUTPUT_TOKENS
  ) || 12000;
// В проде никогда не логируем промпты. В dev всегда показываем полный текст.
const ALLOW_AI_LOGS = process.env.NODE_ENV === 'development';
const AI_DEFAULT_EMOJI_PREFIX = '✨ ';
const AI_CUSTOM_EMOJI_PREFIX = '✏️ ';
const AI_EMOJI_PREFIXES = [AI_DEFAULT_EMOJI_PREFIX, AI_CUSTOM_EMOJI_PREFIX];

// Выбираем префикс для AI-текстов в зависимости от типа сущности.
function resolveAiEmojiPrefix(isCustomEntity: boolean): string {
  return isCustomEntity ? AI_CUSTOM_EMOJI_PREFIX : AI_DEFAULT_EMOJI_PREFIX;
}

// Максимальная длина тела текста с учетом префикса.
function resolveMaxNotificationBodyLength(emojiPrefix: string): number {
  return Math.max(0, MAX_NOTIFICATION_TEXT_LENGTH - emojiPrefix.length);
}
const IMAGE_TAGS = new Set([
  'harm_organs',
  'harm_appearance',
  'harm_mental',
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
]);
const SAFE_IMAGE_TAGS: ImageTag[] = [
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral_abstract',
];
// Особые правила для конкретных тем (легко расширять при изменении контента).
type ImageTagOverride = {
  key?: string;
  keys?: string[];
  kind?: 'habits' | 'therapy';
  allowedTags: ImageTag[];
  fallbackTag?: ImageTag;
  disallowHarmForPositive?: boolean;
};
const IMAGE_TAG_POLICY_OVERRIDES: ImageTagOverride[] = [
  {
    // Можно один ключ в key или несколько в keys
    keys: ['nutrition'],
    // Ограничить только привычки (можно убрать — применится к habits+therapy)
    kind: 'habits',
    // Список разрешённых тегов
    allowedTags: ['neutral_abstract', 'harm_appearance', 'harm_organs'],
    // Тег‑фолбэк, когда пришёл запрещённый/неуместный
    fallbackTag: 'neutral_abstract',
    // Запрещать harm_* для «позитивных» текстов
    disallowHarmForPositive: true,
  },
];
const HARM_MARKERS = [
  /вред/iu,
  /риск/iu,
  /опас/iu,
  /болез/iu,
  /инфаркт/iu,
  /инсульт/iu,
  /рак/iu,
  /онколог/iu,
  /смерт/iu,
  /тяжел/iu,
  /токс/iu,
  /поврежд/iu,
  /разруш/iu,
  /ухудш/iu,
  /зависим/iu,
  /печен/iu,
  /сердц/iu,
  /сосуд/iu,
  /легк/iu,
];
const MIXED_SUBTYPES = new Set(['reminder', 'informational', 'motivational']);
const SUPPORT_MARKERS = [
  /держись/iu,
  /ты справишься/iu,
  /я с тобой/iu,
  /мы рядом/iu,
  /ты не один/iu,
  /поддерж/iu,
];
const FACT_MARKERS = [
  /\d/,
  /риск/iu,
  /повышает/iu,
  /снижает/iu,
  /увеличивает/iu,
  /уменьшает/iu,
  /статистик/iu,
  /процент/iu,
];
// Маркеры для эвристического определения actionHint по тексту.
const MEDITATION_HINT_MARKERS = [
  /медитац/iu,
  /медит/iu,
  /осознанн/iu,
  /mindful/iu,
  /meditat/iu,
];
const BREATHING_HINT_MARKERS = [
  /дыхател/iu,
  /дыхани/iu,
  /4\s*[-–—‑]?\s*7\s*[-–—‑]?\s*8/iu,
  /4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4\s*[-–—‑]?\s*4/iu,
  /коробочн/iu,
  /квадратн.*дых/iu,
  /box\s*breath/iu,
  /square\s*breath/iu,
  /пранаям/iu,
  /pranayama/iu,
];
type ImageTag =
  | 'harm_organs'
  | 'harm_appearance'
  | 'harm_mental'
  | 'activity'
  | 'nature'
  | 'meditation'
  | 'daily_life'
  | 'neutral_abstract';
type MixedElementSubtype = 'reminder' | 'informational' | 'motivational';
type NormalizedAiItem = {
  text: string;
  imageTag: ImageTag | null;
  subtype: NotificationSubtype | null;
  actionHint: NotificationActionHint;
  subtypeRestored: boolean;
};

type ImageTagPolicy = {
  allowedTags: ImageTag[];
  fallbackTag: ImageTag;
  disallowHarmForPositive: boolean;
  meditationOnly: boolean;
};

interface GenerateNotificationTextsParams {
  userId: number;
  preferenceId: string;
  kind: 'habits' | 'therapy';
  entityKey: string; // ID для кастомных сущностей, ключ шаблона для шаблонных
  directness: Directness;
  subtype?: HabitSubtype | null;
  textSource: 'ai'; // Только для AI-генерации (не может быть 'templates')
  count?: number; // количество текстов для генерации (по умолчанию 50)
  provider?: 'openai' | 'deepseek' | 'yandex';
  habitIntent?: 'quit' | 'build' | null; // Intent привычки: отказ (quit) или приобретение (build). Передается явно, не угадывается.
  customPromptNotification?: string | null; // Персональные пожелания (только для шаблонных тем и AI)
}

export interface AiNotificationText {
  text: string;
  imageTag: string | null;
  subtype: NotificationSubtype | null;
  actionHint: NotificationActionHint;
}

interface GenerationResult {
  texts: AiNotificationText[];
  provider: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
}

function resolveTone(value?: string | null): Tone {
  if (
    value === 'delicate' ||
    value === 'neutral' ||
    value === 'uplifting' ||
    value === 'resolute' ||
    value === 'demanding'
  ) {
    return value;
  }
  return 'neutral';
}

function normalizeCustomPromptNotification(
  value?: string | null
): string | null {
  const normalized = value ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

/**
 * Fallback функция для определения intent по названию (только для обратной совместимости)
 * Используется только если intent не передан явно
 */
function inferHabitIntentFromName(name: string): 'quit' | 'build' {
  const nameLower = name.toLowerCase();
  if (
    nameLower.includes('отказ') ||
    nameLower.includes('меньше') ||
    nameLower.includes('бросить')
  ) {
    return 'quit';
  }
  return 'build'; // По умолчанию считаем приобретением
}

function computeRefillLockKey(
  userId: number,
  preferenceId: string,
  configHash: string
): bigint {
  // Формируем устойчивый bigint-ключ для advisory lock из стабильных параметров.
  const rawKey = `${userId}:${preferenceId}:${configHash}`;
  const hash = createHash('sha256').update(rawKey).digest();
  return hash.readBigInt64BE(0);
}

/**
 * Загружает AI-сгенерированные тексты из БД
 */
export async function loadAiGeneratedTexts(
  userId: number,
  preferenceId: string,
  configHash: string
): Promise<AiNotificationText[] | null> {
  const [existing] = await db
    .select()
    .from(aiGeneratedNotificationTexts)
    .where(
      and(
        eq(aiGeneratedNotificationTexts.userId, userId),
        eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
        eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
      )
    )
    .limit(1);

  if (existing && existing.texts) {
    return existing.texts as AiNotificationText[];
  }

  return null;
}

/**
 * Загружает AI-сгенерированные тексты вместе с ID записи
 * Используется для получения ID при отслеживании использования
 */
export async function loadAiGeneratedTextsWithId(
  userId: number,
  preferenceId: string,
  configHash: string
): Promise<{ id: number; texts: AiNotificationText[] } | null> {
  const [existing] = await db
    .select()
    .from(aiGeneratedNotificationTexts)
    .where(
      and(
        eq(aiGeneratedNotificationTexts.userId, userId),
        eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
        eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
      )
    )
    .limit(1);

  if (existing && existing.texts) {
    return {
      id: existing.id,
      texts: existing.texts as AiNotificationText[],
    };
  }

  return null;
}

/**
 * Получает Set с индексами уже использованных текстов для конкретного пула
 * @param aiTextId - ID записи с текстами в ai_generated_notification_texts
 * @param excludeAfterDate - опционально: исключить тексты, использованные после этой даты
 * @returns Set с индексами использованных текстов
 */
export async function getUsedTextIndices(
  aiTextId: number,
  excludeAfterDate?: Date
): Promise<Set<number>> {
  const conditions = [eq(aiNotificationTextUsage.aiTextId, aiTextId)];

  if (excludeAfterDate) {
    conditions.push(lte(aiNotificationTextUsage.sentAt, excludeAfterDate));
  }

  const usedRecords = await db
    .select({ textIndex: aiNotificationTextUsage.textIndex })
    .from(aiNotificationTextUsage)
    .where(and(...conditions));

  return new Set(usedRecords.map((record) => record.textIndex));
}

/**
 * Получает Set с хешами уже использованных текстов для конкретного пула
 * Используется для более надежной проверки дубликатов по содержимому, а не только по индексу
 * @param aiTextId - ID записи с текстами в ai_generated_notification_texts
 * @param excludeAfterDate - опционально: исключить тексты, использованные после этой даты
 * @returns Set с хешами использованных текстов
 */
export async function getUsedTextHashes(
  aiTextId: number,
  excludeAfterDate?: Date
): Promise<Set<string>> {
  const conditions = [eq(aiNotificationTextUsage.aiTextId, aiTextId)];

  if (excludeAfterDate) {
    conditions.push(lte(aiNotificationTextUsage.sentAt, excludeAfterDate));
  }

  const usedRecords = await db
    .select({ textHash: aiNotificationTextUsage.textHash })
    .from(aiNotificationTextUsage)
    .where(and(...conditions));

  return new Set(usedRecords.map((record) => record.textHash));
}

/**
 * Нормализует текст для семантического сравнения:
 * - игнорирует регистр
 * - игнорирует пунктуацию
 * - игнорирует порядок слов
 * - убирает лишние пробелы
 * @param text - текст для нормализации
 * @returns нормализованный текст
 */
export function normalizeTextForSemanticHash(text: string): string {
  return (
    text
      // приведение к нормальной юникод-форме (на всякий случай)
      .normalize('NFKC')
      // в нижний регистр
      .toLowerCase()
      // заменяем знаки препинания и лишние символы на пробел
      .replace(/[.,!?;:()[\]"«»„""—-]/g, ' ')
      // все виды пробелов/переносов → один пробел
      .replace(/\s+/g, ' ')
      // обрезаем пробелы по краям
      .trim()
      // разбиваем на слова
      .split(' ')
      // выкидываем пустые (на случай двух пробелов подряд)
      .filter(Boolean)
      // сортируем слова по алфавиту, чтобы порядок не влиял
      .sort()
      // собираем обратно в строку
      .join(' ')
  );
}

/**
 * Вычисляет SHA-256 хеш текста для проверки уникальности
 * Использует семантическую нормализацию для более надежного обнаружения дубликатов
 * @param text - текст для хеширования
 * @returns SHA-256 хеш в hex формате
 */
export function hashNotificationText(text: string): string {
  const normalized = normalizeTextForSemanticHash(text);
  return createHash('sha256').update(normalized).digest('hex');
}

function stripEmojiPrefix(text: string): string {
  const trimmed = text.trim();
  for (const prefix of AI_EMOJI_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return trimmed;
}

function isHarmContext(text: string): boolean {
  const raw = stripEmojiPrefix(text);
  return HARM_MARKERS.some((pattern) => pattern.test(raw));
}

function resolveFallbackImageTag(allowed?: Set<ImageTag> | null): ImageTag {
  if (allowed && allowed.has('meditation')) return 'meditation';
  if (allowed && allowed.has('nature')) return 'nature';
  if (allowed && allowed.size > 0) {
    return Array.from(allowed)[0] as ImageTag;
  }
  return 'nature';
}

function isMeditationTopic(params: {
  entityKey: string;
  entityName: string;
}): boolean {
  const key = params.entityKey.trim().toLowerCase();
  if (key === 'meditation') return true;
  const name = params.entityName.trim().toLowerCase();
  return name.includes('медитац') || name.includes('meditation');
}

function resolveImageTagPolicyOverride(params: {
  kind: 'habits' | 'therapy';
  entityKey: string;
}): ImageTagPolicy | null {
  const normalizedKey = params.entityKey.trim().toLowerCase();
  const match = IMAGE_TAG_POLICY_OVERRIDES.find((item) => {
    const keys = item.keys ?? (item.key ? [item.key] : []);
    const normalizedKeys = keys.map((key) => key.trim().toLowerCase());
    const matchesKey = normalizedKeys.includes(normalizedKey);
    return matchesKey && (item.kind ? item.kind === params.kind : true);
  });

  if (!match) return null;

  const allowedTags = match.allowedTags;
  const fallbackTag =
    match.fallbackTag ?? resolveFallbackImageTag(new Set(allowedTags));
  const meditationOnly =
    allowedTags.length === 1 && allowedTags[0] === 'meditation';

  return {
    allowedTags,
    fallbackTag,
    disallowHarmForPositive: match.disallowHarmForPositive ?? true,
    meditationOnly,
  };
}

function buildImageTagPolicy(params: {
  entityKey: string;
  entityName: string;
  kind: 'habits' | 'therapy';
}): ImageTagPolicy {
  // Сначала проверяем, нет ли специальных правил для темы.
  const override = resolveImageTagPolicyOverride({
    kind: params.kind,
    entityKey: params.entityKey,
  });
  if (override) return override;

  const meditationOnly = isMeditationTopic(params);
  const allowedTags = meditationOnly
    ? (['meditation'] as ImageTag[])
    : (Array.from(IMAGE_TAGS) as ImageTag[]);
  const fallbackTag = meditationOnly ? 'meditation' : 'nature';

  return {
    allowedTags,
    fallbackTag,
    disallowHarmForPositive: true,
    meditationOnly,
  };
}

// Нормализуем тег, чтобы AI мог отдавать варианты с пробелами/дефисами.
function normalizeImageTag(value: unknown): ImageTag | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');
  if (!normalized) return null;
  const resolved = normalized === 'neutral' ? 'neutral_abstract' : normalized;
  return IMAGE_TAGS.has(resolved) ? (resolved as ImageTag) : null;
}

// Валидируем subtype для mixed-элементов с учетом legacy-имен.
function normalizeMixedSubtype(value: unknown): MixedElementSubtype | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'support') return 'motivational';
  if (normalized === 'facts') return 'informational';
  if (normalized === 'reminders') return 'reminder';
  return MIXED_SUBTYPES.has(normalized)
    ? (normalized as MixedElementSubtype)
    : null;
}

// Нормализуем actionHint, чтобы выдерживать разные форматы от моделей.
function normalizeActionHint(value: unknown): NotificationActionHint {
  if (typeof value !== 'string') return 'none';
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');
  if (!normalized) return 'none';
  if (
    normalized === 'breathing' ||
    normalized === 'breath' ||
    normalized === 'breath_practice' ||
    normalized === 'breath_practices'
  ) {
    return 'breathing';
  }
  if (
    normalized === 'meditation' ||
    normalized === 'meditate' ||
    normalized === 'meditations'
  ) {
    return 'meditation';
  }
  return 'none';
}

function inferActionHintFromText(
  text: string,
  imageTag: ImageTag | null
): NotificationActionHint {
  // Бэкап-эвристика: если actionHint не пришёл от модели, определяем по смысловым маркерам.
  const raw = stripEmojiPrefix(text).toLowerCase();
  const hasMeditation = MEDITATION_HINT_MARKERS.some((pattern) =>
    pattern.test(raw)
  );
  const hasBreathing = BREATHING_HINT_MARKERS.some((pattern) =>
    pattern.test(raw)
  );

  // Если есть явные дыхательные маркеры без медитации — ведём в дыхательные.
  if (hasBreathing && !hasMeditation) {
    return 'breathing';
  }

  if (hasMeditation || imageTag === 'meditation') {
    return 'meditation';
  }

  return 'none';
}

function inferSubtypeFromText(text: string): MixedElementSubtype {
  const raw = stripEmojiPrefix(text);
  if (SUPPORT_MARKERS.some((pattern) => pattern.test(raw))) {
    return 'motivational';
  }
  if (FACT_MARKERS.some((pattern) => pattern.test(raw))) {
    return 'informational';
  }
  return 'reminder';
}

function computeSubtypeTargets(
  total: number
): Record<MixedElementSubtype, number> {
  const base = Math.floor(total / 3);
  const remainder = total % 3;
  const order: MixedElementSubtype[] = [
    'motivational',
    'informational',
    'reminder',
  ];
  const targets: Record<MixedElementSubtype, number> = {
    motivational: base,
    informational: base,
    reminder: base,
  };
  for (let i = 0; i < remainder; i += 1) {
    targets[order[i]] += 1;
  }
  return targets;
}

// Мягко выравниваем распределение mixed-сабтайпов, не трогая явные AI-выборы.
function rebalanceMixedSubtypes(items: NormalizedAiItem[]): void {
  const total = items.length;
  if (total === 0) return;

  const targets = computeSubtypeTargets(total);
  const counts: Record<MixedElementSubtype, number> = {
    motivational: 0,
    informational: 0,
    reminder: 0,
  };

  for (const item of items) {
    if (item.subtype && item.subtype !== 'mixed') {
      counts[item.subtype as MixedElementSubtype] += 1;
    }
  }

  const deficits: Record<MixedElementSubtype, number> = {
    motivational: targets.motivational - counts.motivational,
    informational: targets.informational - counts.informational,
    reminder: targets.reminder - counts.reminder,
  };

  const hasDeficits = Object.values(deficits).some((value) => value > 0);
  if (!hasDeficits) return;

  const candidates = items.filter(
    (item) =>
      item.subtypeRestored &&
      item.subtype &&
      item.subtype !== 'mixed' &&
      !(item.imageTag && item.imageTag.startsWith('harm_'))
  );

  for (const item of candidates) {
    if (!Object.values(deficits).some((value) => value > 0)) {
      break;
    }

    const preferred = inferSubtypeFromText(item.text);
    let chosen: MixedElementSubtype | null = null;

    if (deficits[preferred] > 0) {
      chosen = preferred;
    } else {
      const fallback = (
        Object.entries(deficits) as Array<[MixedElementSubtype, number]>
      )
        .filter(([, value]) => value > 0)
        .sort((left, right) => right[1] - left[1])[0];
      chosen = fallback ? fallback[0] : null;
    }

    if (chosen && item.subtype !== chosen) {
      counts[item.subtype as MixedElementSubtype] -= 1;
      deficits[item.subtype as MixedElementSubtype] += 1;
      item.subtype = chosen;
      counts[chosen] += 1;
      deficits[chosen] -= 1;
    }
  }
}

// Нормализуем вход (строки/объекты) в единый массив AiNotificationText.
export function normalizeNotificationItems(
  rawItems: Array<string | AiNotificationText | Record<string, unknown>>,
  expectedCount: number,
  options: {
    isMixed: boolean;
    allowedImageTags?: Set<ImageTag> | null;
    fallbackImageTag?: ImageTag | null;
    disallowHarmForPositive?: boolean;
    addEmojiPrefix?: boolean;
    emojiPrefix?: string;
  }
): AiNotificationText[] {
  const normalized: NormalizedAiItem[] = [];
  const emojiPrefix = options.emojiPrefix ?? AI_DEFAULT_EMOJI_PREFIX;
  const shouldPrefix = options.addEmojiPrefix !== false;
  const maxBodyLength = shouldPrefix
    ? resolveMaxNotificationBodyLength(emojiPrefix)
    : MAX_NOTIFICATION_TEXT_LENGTH;

  for (const item of rawItems) {
    let rawText: string | null = null;
    let rawImageTag: unknown = null;
    let rawSubtype: unknown = null;
    let rawActionHint: unknown = null;

    if (typeof item === 'string') {
      rawText = item;
    } else if (item && typeof item === 'object') {
      rawText =
        typeof (item as { text?: unknown }).text === 'string'
          ? String((item as { text?: unknown }).text)
          : null;
      rawImageTag = (item as { imageTag?: unknown }).imageTag;
      rawSubtype = (item as { subtype?: unknown }).subtype;
      rawActionHint =
        (item as { actionHint?: unknown }).actionHint ??
        (item as { action_hint?: unknown }).action_hint;
    }

    if (!rawText) continue;

    const cleaned = String(rawText).replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    const baseText = shouldPrefix ? stripEmojiPrefix(cleaned) : cleaned;
    if (!baseText) continue;

    if (baseText.length > maxBodyLength) {
      continue;
    }

    const text = shouldPrefix ? `${emojiPrefix}${baseText}` : baseText;

    if (text.length > MAX_NOTIFICATION_TEXT_LENGTH) {
      continue;
    }

    let imageTag = normalizeImageTag(rawImageTag);
    const subtype = options.isMixed ? normalizeMixedSubtype(rawSubtype) : null;
    let actionHint = normalizeActionHint(rawActionHint);

    const allowedTags = options.allowedImageTags ?? null;
    const hasFallbackOverride = Object.prototype.hasOwnProperty.call(
      options,
      'fallbackImageTag'
    );
    const fallbackTag = hasFallbackOverride
      ? (options.fallbackImageTag ?? null)
      : resolveFallbackImageTag(allowedTags);

    if (imageTag && allowedTags && !allowedTags.has(imageTag)) {
      imageTag = fallbackTag ?? null;
    }

    if (
      imageTag &&
      imageTag.startsWith('harm_') &&
      options.disallowHarmForPositive
    ) {
      if (!isHarmContext(text)) {
        imageTag = fallbackTag ?? null;
      }
    }

    if (actionHint === 'none') {
      actionHint = inferActionHintFromText(baseText, imageTag);
    }

    normalized.push({
      text,
      imageTag,
      subtype: subtype ?? null,
      actionHint,
      subtypeRestored: false,
    });
  }

  if (options.isMixed) {
    for (const item of normalized) {
      if (item.subtype) continue;
      // Если subtype отсутствует, восстанавливаем по безопасным правилам.
      if (item.imageTag && item.imageTag.startsWith('harm_')) {
        item.subtype = 'informational';
      } else {
        item.subtype = 'motivational';
      }
      item.subtypeRestored = true;
    }

    rebalanceMixedSubtypes(normalized);
  }

  return normalized.slice(0, expectedCount).map((item) => ({
    text: item.text,
    imageTag: item.imageTag,
    subtype: item.subtype,
    actionHint: item.actionHint,
  }));
}

function extractTextValue(item: string | AiNotificationText): string {
  return typeof item === 'string' ? item : item.text;
}

function extractJsonArrayCandidate(raw: string): string | null {
  // Пробуем вытащить самый внешний JSON-массив, если модель отдала лишний текст.
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return raw.slice(start, end + 1);
}

/**
 * Удаляет старые тексты с другим хешем конфигурации
 * Используется при перегенерации после изменения настроек
 */
async function cleanupOldTexts(
  userId: number,
  preferenceId: string,
  newConfigHash: string
): Promise<void> {
  try {
    // 1. Найти все записи с текстами для этой preference с другим хешем
    const oldTexts = await db
      .select({ id: aiGeneratedNotificationTexts.id })
      .from(aiGeneratedNotificationTexts)
      .where(
        and(
          eq(aiGeneratedNotificationTexts.userId, userId),
          eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
          sql`${aiGeneratedNotificationTexts.generationConfigHash} != ${newConfigHash}`
        )
      );

    if (oldTexts.length === 0) {
      return; // Нет старых текстов для удаления
    }

    console.log(
      `[AI Generation] 🧹 Cleaning up ${oldTexts.length} old text pool(s) with different hash for userId=${userId}, preferenceId=${preferenceId}`
    );

    // 2. Удалить записи об использовании старых текстов
    for (const oldText of oldTexts) {
      await db
        .delete(aiNotificationTextUsage)
        .where(eq(aiNotificationTextUsage.aiTextId, oldText.id));
    }

    // 3. Удалить старые тексты
    await db
      .delete(aiGeneratedNotificationTexts)
      .where(
        and(
          eq(aiGeneratedNotificationTexts.userId, userId),
          eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
          sql`${aiGeneratedNotificationTexts.generationConfigHash} != ${newConfigHash}`
        )
      );

    console.log(
      `[AI Generation] ✅ Cleaned up ${oldTexts.length} old text pool(s) and their usage records`
    );
  } catch (error) {
    console.error(`[AI Generation] ❌ Error cleaning up old texts:`, error);
    // Не прерываем выполнение, так как очистка не критична
  }
}

/**
 * Конфигурация для retry механизма
 */
interface RetryConfig {
  maxRetries: number; // Максимум попыток (включая первую)
  initialDelay: number; // Начальная задержка в миллисекундах
  maxDelay: number; // Максимальная задержка в миллисекундах
  exponentialBase: number; // База для exponential backoff
  retryableErrorCodes: string[]; // Коды ошибок, при которых нужно повторять
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3, // 3 попытки = первая + 2 повтора
  initialDelay: 1000, // 1 секунда
  maxDelay: 30000, // 30 секунд
  exponentialBase: 2,
  retryableErrorCodes: [
    'rate_limit',
    'rate_limit_error',
    'timeout',
    'server_error',
    'internal_error',
    'service_unavailable',
    // HTTP статусы и распространённые gateway-ошибки
    'bad_gateway',
    'gateway_timeout',
    '502',
    '503',
    '504',
    'upstream',
  ],
};

/**
 * Проверяет, является ли ошибка ретрируемой
 */
function isRetryableError(error: any, retryableCodes: string[]): boolean {
  const errorMessage = (error?.message || '').toLowerCase();
  const errorCodeRaw = error?.code ?? error?.statusCode ?? error?.name ?? '';
  const errorCode = String(errorCodeRaw).toLowerCase();

  if (errorCode && retryableCodes.includes(errorCode)) {
    return true;
  }

  // Проверяем коды ошибок
  if (retryableCodes.some((code) => errorMessage.includes(code))) {
    return true;
  }

  // Проверяем HTTP статусы
  const status = error?.status || error?.response?.status || error?.statusCode;
  if (status === 429) return true; // Rate limit
  if (status >= 500 && status < 600) return true; // Server errors

  return false;
}

/**
 * Задержка выполнения
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Оценивает стоимость генерации текстов
 */
function estimateGenerationCost(
  count: number,
  model: string = 'gpt-4o-mini'
): number {
  // Примерная оценка: ~700 токенов на один текст (prompt + completion)
  const tokensPerText = 700;
  const totalTokens = count * tokensPerText;
  // Примерно 50% input, 50% output
  const tokensIn = Math.floor(totalTokens * 0.5);
  const tokensOut = Math.floor(totalTokens * 0.5);

  return estimateCostUSD({
    provider: 'openai',
    model,
    tokensIn,
    tokensOut,
  });
}

/**
 * Выполняет функцию с retry механизмом (exponential backoff)
 */
async function generateWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Проверка, стоит ли повторять
      if (!isRetryableError(error, config.retryableErrorCodes)) {
        // Неретрируемая ошибка - выбрасываем сразу
        console.error(
          `[AI Generation] ❌ Non-retryable error on attempt ${attempt + 1}:`,
          error
        );
        throw error;
      }

      // Проверка лимита попыток
      if (attempt === config.maxRetries - 1) {
        // Это была последняя попытка
        console.error(
          `[AI Generation] ❌ Failed after ${config.maxRetries} attempts:`,
          lastError
        );
        throw new Error(
          `Failed to generate texts after ${config.maxRetries} attempts: ${lastError.message}`
        );
      }

      // Логирование и задержка перед следующей попыткой
      console.warn(
        `[AI Generation] ⚠️ Attempt ${attempt + 1}/${config.maxRetries} failed, retrying in ${delay}ms:`,
        error
      );

      await sleep(delay);
      delay = Math.min(delay * config.exponentialBase, config.maxDelay);
    }
  }

  throw lastError || new Error('Failed to generate texts');
}

/**
 * Вычисляет maxOutputTokens для количества текстов
 */
function computeMaxOutputTokensForCount(count: number): number {
  // Формула: 120 токенов на текст + 800 запас под формат JSON
  const dynamicMaxOutputTokens = count * 120 + 800;
  return Math.min(dynamicMaxOutputTokens, MAX_OUTPUT_TOKENS_CAP);
}

/**
 * Генерирует партию уведомлений через LLM (один запрос)
 */
async function generateNotificationBatch(params: {
  provider: LlmProviderPort['id'];
  model: string;
  systemPrompt: string;
  count: number;
  scenarioSettings: typeof config.llm.openai.settings.notifications;
  isMixed: boolean;
  imageTagPolicy: ImageTagPolicy;
  emojiPrefix: string;
}): Promise<{
  items: AiNotificationText[];
  model: string;
  rawContent: string;
}> {
  const maxOutputTokens = computeMaxOutputTokensForCount(params.count);

  // Генерируем с retry механизмом
  const result = await generateWithRetry(async () => {
    return await chatViaProvider({
      provider: params.provider,
      model: params.model,
      messages: [
        {
          role: 'system',
          content: params.systemPrompt,
        },
        {
          role: 'user',
          content: `Сгенерируй ДО ${params.count} вариантов уведомлений в формате JSON объекта с полем items (массив объектов). Верни НЕ пустой массив items. Если все варианты не помещаются, верни сколько поместится.`,
        },
      ],
      options: {
        scenario: 'notifications', // Использует настройки из конфига
        temperature: params.scenarioSettings.temperature,
        maxOutputTokens,
      },
    });
  });

  // ВАЖНО: Логируем ответ только в dev, в проде — без содержимого.
  if (ALLOW_AI_LOGS) {
    const responsePreview = result.content.substring(0, 500);
    console.log(
      `[AI Generation] 📝 Raw LLM response length: ${result.content.length} characters, preview: ${responsePreview}...`
    );
  } else {
    const responseHash = createHash('sha256')
      .update(result.content)
      .digest('hex');
    console.log(
      `[AI Generation] 📝 Raw LLM response length: ${result.content.length} characters, hash: ${responseHash}`
    );
  }

  const items = parseAndValidateTexts(result.content, params.count, {
    isMixed: params.isMixed,
    allowedImageTags: new Set(params.imageTagPolicy.allowedTags),
    fallbackImageTag: params.imageTagPolicy.fallbackTag,
    disallowHarmForPositive: params.imageTagPolicy.disallowHarmForPositive,
    emojiPrefix: params.emojiPrefix,
  });

  console.log(
    `[AI Generation] 📊 Parsed texts count: ${items.length} (expected: ${params.count}, difference: ${params.count - items.length})`
  );

  if (items.length === 0) {
    throw new Error('Failed to generate valid notification texts');
  }

  return {
    items,
    model: result.model || params.model,
    rawContent: result.content,
  };
}

/**
 * Генерирует уведомления батчами, чтобы уменьшить риск таймаутов/502
 */
async function generateNotificationItemsBatched(params: {
  provider: LlmProviderPort['id'];
  model: string;
  systemPrompt: string;
  totalCount: number;
  scenarioSettings: typeof config.llm.openai.settings.notifications;
  isMixed: boolean;
  imageTagPolicy: ImageTagPolicy;
  emojiPrefix: string;
}): Promise<{
  items: AiNotificationText[];
  model: string;
  isPartial: boolean;
}> {
  const items: AiNotificationText[] = [];
  let remaining = params.totalCount;
  // Стартовый размер батча: 25 для 50, иначе весь объём
  let batchSize = params.totalCount >= 50 ? 25 : params.totalCount;
  const minBatchSize = 10;
  let lastModel = params.model;
  let isPartial = false;

  while (remaining > 0) {
    const currentBatch = Math.min(remaining, batchSize);

    try {
      const batch = await generateNotificationBatch({
        provider: params.provider,
        model: params.model,
        systemPrompt: params.systemPrompt,
        count: currentBatch,
        scenarioSettings: params.scenarioSettings,
        isMixed: params.isMixed,
        imageTagPolicy: params.imageTagPolicy,
        emojiPrefix: params.emojiPrefix,
      });

      lastModel = batch.model || lastModel;
      items.push(...batch.items);
      remaining -= batch.items.length;

      // Если модель вернула меньше, чем просили — пробуем добрать следующей итерацией
      if (batch.items.length < currentBatch) {
        console.warn(
          `[AI Generation] ⚠️ Batch produced ${batch.items.length}/${currentBatch} texts, remaining=${remaining}`
        );
      }
    } catch (error) {
      const canRetry = isRetryableError(
        error,
        DEFAULT_RETRY_CONFIG.retryableErrorCodes
      );

      // Если уже есть часть текстов — возвращаем частичный результат
      if (items.length > 0) {
        console.warn(
          `[AI Generation] ⚠️ Batch failed, returning partial result (${items.length}/${params.totalCount})`
        );
        isPartial = true;
        break;
      }

      if (!canRetry || batchSize <= minBatchSize) {
        throw error;
      }

      const nextBatchSize = Math.max(minBatchSize, Math.floor(batchSize / 2));
      if (nextBatchSize === batchSize) {
        throw error;
      }

      console.warn(
        `[AI Generation] ⚠️ Batch failed, reducing batch size: ${batchSize} → ${nextBatchSize}`
      );
      batchSize = nextBatchSize;
    }
  }

  return { items, model: lastModel, isPartial };
}

/**
 * Генерирует тексты уведомлений через AI
 */
export async function generateNotificationTexts(
  params: GenerateNotificationTextsParams
): Promise<GenerationResult> {
  // 1. Загружаем данные о сущности (привычка или терапия)
  let entityName = '';
  let entityDescription: string | null = null;
  let isCustomHabit = false; // Флаг: найдена ли кастомная привычка в БД
  let isCustomTherapy = false; // Флаг: найдена ли кастомная тема в БД
  // Используем переданный intent, если он есть, иначе будем определять из БД/каталога
  let habitIntent: 'quit' | 'build' | null = params.habitIntent ?? null;

  if (params.kind === 'habits') {
    // Для кастомных сущностей entityKey = ID
    const [habit] = await db
      .select()
      .from(habits)
      .where(
        and(
          eq(habits.id, params.entityKey), // Для кастомных сущностей entityKey = ID
          eq(habits.userId, params.userId)
        )
      )
      .limit(1);

    if (habit) {
      // Кастомная привычка найдена в БД
      isCustomHabit = true;
      entityName = habit.name;
      entityDescription = habit.description;
      // Используем переданный intent, если он есть, иначе берем из БД
      if (!habitIntent) {
        habitIntent = habit.intent as 'quit' | 'build' | null;
      }
      console.log(
        `[AI Generation] Found custom habit: id=${habit.id}, name=${habit.name}, entityKey param=${params.entityKey}, intent=${habitIntent} (from params: ${params.habitIntent ?? 'not provided'}, from DB: ${habit.intent})`
      );
    } else {
      // Привычка не найдена в БД - проверяем, является ли это шаблоном
      const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
      const catalogHabit = findHabitByKey(params.entityKey);

      if (catalogHabit) {
        // Это готовый шаблон привычки (water, meditation, training и т.д.)
        isCustomHabit = false;
        // Используем читаемое название из каталога вместо ключа
        entityName = catalogHabit.name;
        entityDescription = catalogHabit.description || null;
        // Используем intent из каталога, если не передан явно
        if (!habitIntent) {
          habitIntent = catalogHabit.intent;
        }
        console.log(
          `[AI Generation] Template habit found in catalog: entityKey=${params.entityKey}, name=${catalogHabit.name}, intent=${habitIntent} (from params: ${params.habitIntent ?? 'not provided'}, from catalog: ${catalogHabit.intent})`
        );
      } else {
        // Не найдено ни в БД, ни в каталоге - используем entityKey как имя
        entityName = params.entityKey;
        entityDescription = null;
        // Если intent не передан, используем fallback (только для обратной совместимости)
        if (!habitIntent) {
          habitIntent = inferHabitIntentFromName(entityName);
          console.warn(
            `[AI Generation] ⚠️ Habit not found in DB and not in catalog: entityKey=${params.entityKey}. Using fallback intent inference: ${habitIntent}`
          );
        }
      }
    }
  } else {
    // therapy
    // Сначала пробуем найти в кастомных темах
    const [topic] = await db
      .select()
      .from(therapyTopicsCustom)
      .where(
        and(
          eq(therapyTopicsCustom.id, params.entityKey),
          eq(therapyTopicsCustom.userId, params.userId)
        )
      )
      .limit(1);

    if (topic) {
      // Кастомная тема найдена в БД
      isCustomTherapy = true;
      entityName = topic.name;
      entityDescription = topic.description;
      console.log(
        `[AI Generation] Found custom therapy topic: id=${topic.id}, name=${topic.name}, entityKey param=${params.entityKey}`
      );
    } else {
      // Тема не найдена в БД - предполагаем, что это готовый шаблон
      // (для терапии нет каталога, как для привычек, поэтому просто используем entityKey)
      isCustomTherapy = false;
      entityName = params.entityKey;
      entityDescription = null;
      console.log(
        `[AI Generation] Template therapy topic: entityKey=${params.entityKey} (using as name)`
      );
    }
  }

  const isCustomEntity =
    params.kind === 'habits' ? isCustomHabit : isCustomTherapy;
  const emojiPrefix = resolveAiEmojiPrefix(isCustomEntity);
  const maxBodyLength = resolveMaxNotificationBodyLength(emojiPrefix);
  const customPromptNotification = isCustomEntity
    ? null
    : normalizeCustomPromptNotification(params.customPromptNotification);

  // 2. Загружаем глобальные настройки пользователя (tone, addressing)
  const [userPrefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, params.userId))
    .limit(1);

  const tone = resolveTone(userPrefs?.tone as string | null | undefined);
  const addressing: Addressing =
    (userPrefs?.addressing as Addressing) || 'informal';

  const [userProfile] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const userGender =
    userProfile?.gender === 'male' || userProfile?.gender === 'female'
      ? userProfile.gender
      : null;

  // 3. Вычисляем хеш конфигурации
  // КРИТИЧНО: habitIntent должен быть включен в хеш, чтобы при изменении intent генерировался новый пул текстов
  const configHash = computeGenerationConfigHash({
    entityName,
    entityDescription,
    tone,
    addressing,
    directness: params.directness as 'soft' | 'moderate' | 'hard',
    subtype: params.subtype as
      | 'reminder'
      | 'informational'
      | 'motivational'
      | 'mixed'
      | null,
    textSource: params.textSource,
    kind: params.kind,
    habitIntent: params.kind === 'habits' ? habitIntent : null, // Включаем intent только для habits
    userGender,
    customPromptNotification,
  });

  console.log(
    `[AI Generation] Computed config hash: ${configHash.substring(0, 8)}..., entityName: ${entityName}, entityDescription: ${entityDescription || 'null'}, directness: ${params.directness}, subtype: ${params.subtype}, textSource: ${params.textSource}, kind: ${params.kind}`
  );

  // 4. Очищаем старые тексты с другим хешем (если настройки изменились)
  await cleanupOldTexts(params.userId, params.preferenceId, configHash);

  // 4.1. Проверяем, есть ли уже сгенерированные тексты с ТОЧНЫМ хешем
  // ВАЖНО: Проверяем только по точному хешу, чтобы избежать несоответствий
  const existingTexts = await loadAiGeneratedTexts(
    params.userId,
    params.preferenceId,
    configHash
  );

  const imageTagPolicy = buildImageTagPolicy({
    entityKey: params.entityKey,
    entityName,
    kind: params.kind,
  });

  if (existingTexts && existingTexts.length > 0) {
    // Используем существующие тексты
    const [existing] = await db
      .select()
      .from(aiGeneratedNotificationTexts)
      .where(
        and(
          eq(aiGeneratedNotificationTexts.userId, params.userId),
          eq(aiGeneratedNotificationTexts.preferenceId, params.preferenceId),
          eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
        )
      )
      .limit(1);

    const textsWithEmoji = normalizeNotificationItems(
      existingTexts,
      existingTexts.length,
      {
        isMixed: params.subtype === 'mixed',
        allowedImageTags: new Set(imageTagPolicy.allowedTags),
        fallbackImageTag: imageTagPolicy.fallbackTag,
        disallowHarmForPositive: imageTagPolicy.disallowHarmForPositive,
        emojiPrefix,
      }
    );

    if (
      existing?.id &&
      textsWithEmoji.some(
        (text) => !extractTextValue(text).startsWith(emojiPrefix)
      )
    ) {
      // Обновляем префиксы в пуле, чтобы кастомные AI-тексты были помечены корректно.
      await db
        .update(aiGeneratedNotificationTexts)
        .set({
          texts: textsWithEmoji,
          updatedAt: sql`NOW()`,
        })
        .where(eq(aiGeneratedNotificationTexts.id, existing.id));
    }

    console.log(
      `[AI Generation] ✅ Using existing AI texts: userId: ${params.userId}, preferenceId: ${params.preferenceId}, configHash: ${configHash.substring(0, 8)}..., textsCount: ${textsWithEmoji.length}`
    );

    if (textsWithEmoji.length > 0) {
      return {
        texts: textsWithEmoji,
        provider: existing?.provider || 'openai',
        model: existing?.model || '',
        tokensUsed: existing?.tokensUsed || 0,
        costUsd: Number(existing?.costUsd || 0),
      };
    }

    console.warn(
      `[AI Generation] ⚠️ Existing texts invalid after normalization, regenerating pool`
    );
  }

  console.log(
    `[AI Generation] No existing texts found, generating new ones: userId: ${params.userId}, preferenceId: ${params.preferenceId}, configHash: ${configHash.substring(0, 8)}...`
  );

  // 5. Строим промпт
  const systemPrompt = buildNotificationSystemPrompt({
    entityKey: params.entityKey,
    entityName,
    description: entityDescription,
    tone,
    addressing,
    userGender,
    directness: params.directness,
    subtype: params.subtype,
    kind: params.kind,
    habitIntent, // Передаем intent для формирования правильных инструкций
    imageTagPolicy,
    customPromptNotification,
    emojiPrefix,
    maxBodyLength,
    isCustomEntity,
  });

  const count = params.count || DEFAULT_TEXT_COUNT;

  // ВАЖНО: Логируем count для отладки
  console.log(
    `[AI Generation] 🎯 Generating texts with count: ${count} (DEFAULT_TEXT_COUNT: ${DEFAULT_TEXT_COUNT}, params.count: ${params.count ?? 'undefined'})`
  );

  // Гарантируем, что count не меньше DEFAULT_TEXT_COUNT для первой генерации
  if (count < DEFAULT_TEXT_COUNT) {
    console.warn(
      `[AI Generation] ⚠️ WARNING: count (${count}) is less than DEFAULT_TEXT_COUNT (${DEFAULT_TEXT_COUNT}). This may cause insufficient texts.`
    );
  }

  // 5.1. Валидация бюджета перед генерацией
  const provider = params.provider || config.llm.defaultProvider;
  const model = config.llm.openai.models.notifications;
  const estimatedCost = estimateGenerationCost(count, model);

  if (estimatedCost > config.llm.limits.maxRequestUSD) {
    throw new Error(
      `[AI Generation] Estimated cost ($${estimatedCost.toFixed(6)}) exceeds max request limit ($${config.llm.limits.maxRequestUSD}). Cannot generate ${count} texts.`
    );
  }

  console.log(
    `[AI Generation] 💰 Estimated cost for ${count} texts: $${estimatedCost.toFixed(6)} (model: ${model})`
  );

  // 6. Генерируем тексты батчами (уменьшаем риск 502/таймаутов)
  const scenarioSettings = config.llm.openai.settings.notifications;
  const batchResult = await generateNotificationItemsBatched({
    provider,
    model,
    systemPrompt,
    totalCount: count,
    scenarioSettings,
    isMixed: params.subtype === 'mixed',
    imageTagPolicy,
    emojiPrefix,
  });

  const texts = batchResult.items;

  // ВАЖНО: Недобор допускается, просто логируем для наблюдения.
  if (texts.length < count) {
    console.warn(
      `[AI Generation] ⚠️ Generated ${texts.length}/${count} texts. Accepting partial result.`
    );
  }

  // 8. Вычисляем реальную стоимость на основе длин текстов
  // Примерная оценка токенов: ~4 символа на токен
  const promptText =
    systemPrompt +
    `\nСгенерируй ДО ${count} вариантов уведомлений в формате JSON объекта с полем items (массив объектов). Каждый текст должен быть примерно 140-${maxBodyLength} символов (сервер добавит префикс "${emojiPrefix}").`;
  const tokensIn = Math.ceil(promptText.length / 4);
  const tokensOut = Math.ceil(
    texts.reduce((sum, text) => sum + text.text.length, 0) / 4
  );
  const actualTokensUsed = tokensIn + tokensOut;
  const actualCostUsd = estimateCostUSD({
    provider: 'openai',
    model: batchResult.model || model,
    tokensIn,
    tokensOut,
  });

  console.log(
    `[AI Generation] 💰 Actual cost: $${actualCostUsd.toFixed(6)} (tokens: ${actualTokensUsed}, in: ${tokensIn}, out: ${tokensOut}, model: ${batchResult.model || model})`
  );

  // ВАЖНО: Проверяем, что kind валидный
  if (params.kind !== 'habits' && params.kind !== 'therapy') {
    throw new Error(
      `[AI Generation] Invalid kind: ${params.kind}. Must be 'habits' or 'therapy'`
    );
  }

  // Используем entityKey как есть
  let finalEntityKey = params.entityKey;

  if (params.kind === 'habits') {
    // Используем флаг isCustomHabit, установленный выше
    if (isCustomHabit) {
      // Это кастомная привычка - используем ID
      finalEntityKey = params.entityKey; // ID для кастомных сущностей
      console.log(
        `[AI Generation] ✅ Using ID for custom habit: entityKey=${params.entityKey}`
      );
    } else {
      // Это готовый шаблон - используем entityKey как есть
      finalEntityKey = params.entityKey;
      console.log(
        `[AI Generation] ✅ Template habit - using entityKey as finalEntityKey: ${finalEntityKey}`
      );
    }
  } else if (params.kind === 'therapy') {
    // Для терапии используем флаг isCustomTherapy, установленный выше
    if (isCustomTherapy) {
      // Это кастомная тема - используем ID
      finalEntityKey = params.entityKey; // ID для кастомных сущностей
      console.log(
        `[AI Generation] ✅ Using ID for custom therapy topic: entityKey=${params.entityKey}`
      );
    } else {
      // Это готовый шаблон - используем entityKey как есть
      finalEntityKey = params.entityKey;
      console.log(
        `[AI Generation] ✅ Template therapy topic - using entityKey as finalEntityKey: ${finalEntityKey}`
      );
    }
  }

  console.log(
    `[AI Generation] Saving AI texts to DB: userId: ${params.userId}, preferenceId: ${params.preferenceId}, kind: ${params.kind}, entityKey: ${finalEntityKey} (READABLE), textSource: ${params.textSource}, configHash: ${configHash.substring(0, 8)}..., textsCount: ${texts.length}`
  );

  // ВАЖНО: Используем upsert для обновления существующих записей с тем же хешем
  // Это предотвращает дубликаты и обновляет тексты, если хеш совпадает
  await db
    .insert(aiGeneratedNotificationTexts)
    .values({
      userId: params.userId,
      preferenceId: params.preferenceId,
      kind: params.kind,
      entityKey: finalEntityKey, // ID для кастомных, ключ шаблона для шаблонных
      entityDisplayName: entityName || null, // Читаемое название для удобства разработчиков
      textSource: params.textSource,
      texts,
      generationConfigHash: configHash,
      provider,
      model: batchResult.model || model,
      tokensUsed: actualTokensUsed,
      costUsd: actualCostUsd.toString(),
    })
    .onConflictDoUpdate({
      target: [
        aiGeneratedNotificationTexts.userId,
        aiGeneratedNotificationTexts.preferenceId,
        aiGeneratedNotificationTexts.generationConfigHash,
      ],
      set: {
        texts,
        entityDisplayName: entityName || null, // Обновляем display name при обновлении записи
        provider,
        model: batchResult.model || model,
        tokensUsed: actualTokensUsed,
        costUsd: actualCostUsd.toString(),
        updatedAt: sql`NOW()`,
      },
    });

  console.log(
    `[AI Generation] ✅ AI texts saved to DB: userId: ${params.userId}, preferenceId: ${params.preferenceId}, configHash: ${configHash.substring(0, 8)}...`
  );

  // Если получили только часть текстов — ставим задачу на догенерацию
  if (batchResult.isPartial || texts.length < count) {
    void enqueueAiTextPoolRefillJob({
      preferenceId: params.preferenceId,
      userId: params.userId,
      configHash,
      delayMs: 60_000,
      reason: 'partial_generation',
    });
  }

  return {
    texts,
    provider,
    model: batchResult.model || model,
    tokensUsed: actualTokensUsed,
    costUsd: actualCostUsd,
  };
}

/**
 * Строит системный промпт для генерации уведомлений
 */
function buildNotificationSystemPrompt(params: {
  entityKey: string;
  entityName: string;
  description?: string | null;
  tone: Tone;
  addressing: Addressing;
  userGender?: 'male' | 'female' | null;
  directness: Directness;
  subtype?: HabitSubtype | null;
  kind: 'habits' | 'therapy';
  habitIntent?: 'quit' | 'build' | null; // Intent привычки: отказ (quit) или приобретение (build)
  imageTagPolicy: ImageTagPolicy;
  customPromptNotification?: string | null; // Персональные пожелания пользователя (только для AI)
  emojiPrefix: string;
  maxBodyLength: number;
  isCustomEntity?: boolean;
}): string {
  const genderLabel =
    params.userGender === 'male'
      ? 'мужской'
      : params.userGender === 'female'
        ? 'женский'
        : null;

  const toneMap: Record<Tone, string> = {
    delicate: 'деликатный, мягкий',
    neutral: 'нейтральный',
    uplifting: 'поддерживающий, вдохновляющий',
    resolute: 'решительный, мотивационный',
    demanding: 'требовательный, директивный',
    unknown: 'нейтральный',
  };

  const directnessMap: Record<Directness, string> = {
    soft: 'Мягкий',
    moderate: 'Сдержанный',
    hard: 'Жесткий',
  };

  const subtypeMap: Record<HabitSubtype, string> = {
    reminder: 'Напоминание о действии',
    informational: 'Полезные факты',
    motivational: 'Поддержка и мотивация',
    mixed: 'Смешанные уведомления',
  };

  const imageTagList = params.imageTagPolicy.allowedTags.join(', ');
  const safeTagList = SAFE_IMAGE_TAGS.join(', ');
  const isWaterTopic = params.entityKey.trim().toLowerCase() === 'water';
  const isNutritionTopic =
    params.entityKey.trim().toLowerCase() === 'nutrition';

  const imageTagRules = [
    '- imageTag должен соответствовать смыслу текста.',
    '- harm_* используй ТОЛЬКО если текст явно описывает вред/негативные последствия.',
    `- Если текст позитивный или нейтральный, выбирай только: ${safeTagList}.`,
    params.customPromptNotification || params.description
      ? '- Если в описании/пожеланиях есть запрет на "страшные" темы/картинки, НЕ используй harm_* и избегай тяжелых последствий.'
      : null,
    '- Ставь imageTag только если связь с текстом очевидна и однозначна.',
    '- Если смысл расплывчатый, общий или без конкретной визуальной сцены — ставь imageTag = null.',
    '- Не угадывай тег и не подбирай "на всякий случай". Лучше null, чем неверный визуал.',
    isWaterTopic
      ? '- Для темы "Вода" ВСЕГДА ставь imageTag = neutral_abstract. Другие теги запрещены.'
      : null,
    params.imageTagPolicy.meditationOnly
      ? null
      : '- Если нет подходящего тега, ставь imageTag = null (картинка не прикрепляется).',
    params.imageTagPolicy.meditationOnly
      ? '- Для темы "Медитация" ВСЕГДА ставь imageTag = meditation. Другие теги запрещены.'
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Формируем промпт с использованием описания как основной основы
  const descriptionPriorityNotice =
    params.isCustomEntity && params.description
      ? '\n\nВАЖНО: Если описание противоречит subtype/directness/tone, приоритет за описанием пользователя.'
      : '';
  const descriptionContext = params.description
    ? `\n\nОписание и контекст (это ОСНОВА для генерации текстов, используй именно это):\n${params.description}\n\nКРИТИЧЕСКИ ВАЖНО: Все инструкции из описания (обращение, стиль, особые указания) должны применяться к КАЖДОМУ из всех текстов, а не только к первому.${descriptionPriorityNotice}`
    : '';
  const customPromptContext = params.customPromptNotification
    ? `\n\nДополнительные пожелания пользователя (обязательные к учету):\n${params.customPromptNotification}\n\nВАЖНО: Если пожелания противоречат subtype/directness/tone, приоритет за пожеланиями пользователя.`
    : '';
  const userPriorityContext =
    params.customPromptNotification || params.description
      ? `\n\nПРИОРИТЕТ ПОЛЬЗОВАТЕЛЬСКОГО КОНТЕКСТА:\n- Пожелания пользователя и описание имеют приоритет над tone/directness/subtype и другими стилевыми правилами.\n- Если есть конфликт, следуй пользовательскому контексту, даже если это снижает "жесткость" или меняет фокус.\n- Если пользователь просит избегать "страшных" текстов/болезней/картинок — НЕ используй harm_* и не упоминай тяжелые последствия.`
      : '';
  // Формируем инструкции для разных типов уведомлений
  let subtypeInstructions = '';

  if (params.kind === 'habits' && params.subtype) {
    // Базовые инструкции
    const nutritionBalanceNote = isNutritionTopic
      ? '\n- Чередуй пользу здорового питания и вред от вредной пищи.\n- Избегай стыда и обвинений, держи нейтральную поддержку.'
      : '';
    const habitContext = `Все тексты должны быть релевантны этой привычке. Используй смысл названия только как подсказку для понимания поведения, но НЕ копируй название дословно в тексты, особенно если оно звучит как кодовое слово или шутка.${nutritionBalanceNote}`;

    switch (params.subtype) {
      case 'reminder':
        subtypeInstructions = `${habitContext}
- Простые напоминания о действии, связанном с этой привычкой
${params.description ? '- Используй описание как основу для понимания, какое действие нужно напомнить' : ''}`;
        break;
      case 'informational':
        if (params.habitIntent === 'quit') {
          const baseHeader = `${habitContext}
- Факты и полезная информация, связанные с этой привычкой
- Используй разнообразные научные формулировки для начала текстов - чередуй популярные формулировки, используй синонимы и вариации, но НЕ повторяй одни и те же формулировки подряд
- КРИТИЧЕСКИ ВАЖНО: Каждый текст должен иметь уникальное начало! Избегай повторения одинаковых шаблонных фраз в нескольких текстах подряд
- Важно: используй проверенную информацию и статистику. Не выдумывай и не придумывай факты.`;

          if (params.directness === 'soft') {
            subtypeInstructions = `${baseHeader}
- Фокус на мягких формулировках без запугивания
- НЕ упоминай смерть, смертность, смертельные заболевания, рак, онкологию, инфаркт, инсульт и подобные формулировки
- Описывай влияние этой привычки на самочувствие, энергию, настроение, качество жизни, работоспособность
- Используй мягкие формулировки о влиянии на здоровье и самочувствие
- Цель: мягко показать реальные последствия и помочь заметить долгосрочный вред без шок-контента`;
          } else if (params.directness === 'moderate') {
            subtypeInstructions = `${baseHeader}
- Честно описывай медицинские риски, связанные с этой привычкой
- Акцент на механизмах вреда: атеросклероз, снижение эластичности сосудов, повышение артериального давления, воспаление тканей, ухудшение функции печени, снижение иммунитета
- Можешь упоминать серьезные заболевания (болезни сердца, легких, печени), но не в каждом тексте (примерно 1-2 на 10 текстов в рамках одной генерации)
- Допустимы редкие упоминания тяжёлых последствий (инфаркт, инсульт, онкологические заболевания), но без нагнетания и драматизации (10-20% текстов)
- При генерации одного текста: используй вероятностный выбор (10-20% шанс тяжелых исходов)
- Используй нейтральные, фактические, клинически точные формулировки
- Упор на спокойные, фактические формулировки без эмоциональных оценок
- Избегай постоянных упоминаний смертности и смертельных исходов
- Цель: трезво показать серьёзность последствий через понимание механизмов вреда, без нагнетания и драматизации`;
          } else {
            subtypeInstructions = `${baseHeader}
- ИСПОЛЬЗУЙ ЖЕСТКИЕ ФАКТЫ о негативных последствиях: смертность, сокращение продолжительности жизни, тяжёлые заболевания (рак, инфаркт, инсульт и т.п.)
- Прямо показывай, как эта привычка увеличивает риск этих исходов, опираясь на реальные данные и статистику
- Упоминай статистику смертности, риск развития тяжёлых заболеваний, реальные проценты и оценки, если они известны
- Формулировки могут быть строгими и прямыми, но БЕЗ преувеличений и выдуманных цифр
- НЕ используй формулировки типа "умрёшь раньше" - это неэтично и не клинически корректно
- Частота упоминаний: можешь упоминать смертность и тяжелые исходы, но с разнообразием (примерно 3-4 текста на 10 про смерть/рак в рамках одной генерации, НЕ в каждом!)
- При генерации одного текста: используй вероятностный выбор (30-40% шанс тяжелых исходов)
- При генерации партии из 50 текстов: соблюдай распределение тем в рамках одной генерации:
  * 30-40% - смертность и тяжелые исходы
  * 30-40% - серьезные заболевания (без смерти)
  * 20-30% - общие медицинские риски
- КРИТИЧЕСКИ ВАЖНО: Избегай повторения одной и той же болезни в нескольких текстах подряд. Меняй темы: сердце, сосуды, легкие, печень, когнитивные функции, метаболизм, иммунитет
- НЕ делай все тексты про смерть - это надоест и перестанет работать
- Цель: резко отрезвить пользователя и показать цену сохранения привычки в долгосрочной перспективе`;
          }
        } else if (params.habitIntent === 'build') {
          const baseHeader = `${habitContext}
- Факты и полезная информация о пользе этой привычки
- Используй разнообразные научные формулировки для начала текстов - чередуй популярные формулировки, используй синонимы и вариации, но НЕ повторяй одни и те же формулировки подряд
- КРИТИЧЕСКИ ВАЖНО: Каждый текст должен иметь уникальное начало! Избегай повторения одинаковых шаблонных фраз в нескольких текстах подряд
- НЕ упоминай смерть, смертность, смертельные заболевания, рак, онкологию, инфаркт, инсульт - это НЕ относится к полезным привычкам
- Фокус ТОЛЬКО на позитивных изменениях и пользе
- Важно: используй проверенную информацию и статистику. Не выдумывай и не придумывай факты.`;

          if (params.directness === 'soft') {
            subtypeInstructions = `${baseHeader}
- Более эмоциональные формулировки, акцент на чувствах и ощущениях
- Фокус на субъективном опыте и улучшении самочувствия`;
          } else if (params.directness === 'moderate') {
            subtypeInstructions = `${baseHeader}
- Сухие, фактические формулировки с данными
- Фокус на объективных показателях и научных данных`;
          } else {
            subtypeInstructions = `${baseHeader}
- Прямолинейная, конкретная польза с прямыми формулировками
- Фокус на конкретных выгодах и снижении рисков`;
          }

          // СПЕЦИАЛЬНОЕ ПРАВИЛО ДЛЯ КОФЕИНА/КОФЕ
          const entityKeyLower = params.entityKey.trim().toLowerCase();
          const entityNameLower = params.entityName.trim().toLowerCase();
          if (
            entityKeyLower === 'caffeine' ||
            entityKeyLower.includes('кофеин') ||
            entityKeyLower.includes('кофе') ||
            entityNameLower.includes('кофеин') ||
            entityNameLower.includes('кофе')
          ) {
            subtypeInstructions = `${habitContext}
- ВАЖНО: Кофе полезен! НЕ говори о вреде кофе. Проблема в чрезмерных дозах и времени приёма (после 14:00 мешает сну).
- Фокус: баланс и время. Используй разнообразные формулировки.`;
          }
        } else {
          subtypeInstructions = `${habitContext}
- Факты и полезная информация, связанные с этой привычкой
- Используй разнообразные научные формулировки для начала текстов, чередуй их
- КРИТИЧЕСКИ ВАЖНО: НЕ повторяй одни и те же формулировки подряд!`;
        }
        break;
      case 'motivational':
        subtypeInstructions = `${habitContext}
- Поддержка и мотивация в контексте работы с этой привычкой`;
        break;
      case 'mixed':
        subtypeInstructions = `${habitContext}
- Смешанные уведомления, релевантные этой привычке
- Чередуй напоминания, факты и мотивацию`;
        break;
    }
  } else if (params.kind === 'therapy') {
    const therapyContext = params.description
      ? `- Все тексты должны быть релевантны теме из описания выше. Используй описание как основу.`
      : `- Все тексты должны быть релевантны этой теме поддержки.`;

    subtypeInstructions =
      params.subtype === 'motivational'
        ? `${therapyContext}\n- Поддержка и мотивация в контексте этой темы`
        : therapyContext;
  }

  return `Ты помощник для генерации текстов уведомлений для мобильного приложения Mentala.

Контекст:
- Тип: ${params.kind === 'habits' ? 'привычка' : 'тема поддержки'}
- Название (используй только как внутренний контекст): ${params.entityName}${descriptionContext}${customPromptContext}${userPriorityContext}
- Пол пользователя: ${genderLabel || 'не указан'}

Стиль:
- Тон: ${toneMap[params.tone]}
- Обращение: ${params.addressing === 'formal' ? 'на вы' : 'на ты'}
- Прямота: ${directnessMap[params.directness]}
${params.subtype ? `- Фокус уведомления: ${subtypeMap[params.subtype]}` : ''}

КРИТИЧЕСКИ ВАЖНО - применяется ко ВСЕМ текстам без исключения:
- ВСЕ параметры выше (название, описание, тон, обращение, прямота, фокус) должны учитываться в КАЖДОМ тексте
- Каждый из всех текстов должен соответствовать всем указанным параметрам и инструкциям из описания

Требования:
- Каждый текст должен быть примерно 140-${params.maxBodyLength} символов (сервер добавит префикс "${params.emojiPrefix}" к каждому тексту)
- Если пол не указан, используй нейтральные конструкции без рода
- Запрещены формы с альтернативами в скобках (например, "сделал / сделала")
- Тексты должны быть разнообразными и достаточно подробными
${
  params.kind === 'habits'
    ? `- Все тексты должны быть релевантны сути привычки. Название "${params.entityName}" используй только как внутренний контекст.
- НЕ пиши фразы вида «привычка "${params.entityName}"», «делать "${params.entityName}"» и не ставь название в кавычки.
- Если название звучит естественно как действие или состояние (например, "пить воду"), можно использовать его в тексте, но без кавычек и без слова "привычка".`
    : `- Для терапии: фокус на поддержке и рефлексии. Название темы "${params.entityName}" используй только как контекст, избегай странных фраз с названием в кавычках.
- Если название звучит как нормальное состояние ("тревога", "усталость"), можно использовать его естественно.`
}
${subtypeInstructions}

ВАЖНО - запрещено использовать:
- НЕ используй имя пользователя или обращения по имени
- НЕ используй приветствия с упоминанием времени дня (например: "Доброе утро", "Добрый день", "Добрый вечер", "Спокойной ночи"), ЕСЛИ в описании нет явных инструкций об обращении
- НЕ создавай тексты с вопросами к пользователю (например: "Что ты хочешь обсудить?", "Как я могу помочь?", "О чем ты хочешь спросить?")
- НЕ предлагай обсудить что-либо - уведомления должны быть информативными, напоминающими или мотивирующими, но не призывающими к диалогу
- Уведомления - это одностороннее сообщение, а не начало разговора
- НЕ утверждай, что пользователь уже достиг результата или сделал прогресс (например: "ты уже месяц держишься", "ты справился"). Формулируй нейтрально или условно, без фиксации достижений.
- НЕ упоминай название привычки или темы напрямую в текстах, если это не является естественным (например, если название - это общее понятие типа "пить воду", можно использовать, но если название - это специфическое слово типа "Здарова", НЕ используй его)


Формат ответа: JSON объект с полем items (массив объектов).
Каждый объект items содержит поля:
- text (строка)
- imageTag (строка из списка: ${imageTagList} или null)
- actionHint (строка: none | meditation | breathing)
- actionHint = meditation, если текст упоминает медитацию/медитативную практику (даже без прямого призыва)
- actionHint = breathing, если текст упоминает дыхательные практики или дыхательные техники (например: дыхание, 4-7-8, 4-4-4-4, квадратное/коробочное дыхание)
- Если imageTag = meditation, actionHint ОБЯЗАТЕЛЬНО = meditation
- actionHint = none во всех остальных случаях (не используй none, если есть упоминание медитации или дыхания)
${imageTagRules}
${
  params.subtype === 'mixed'
    ? '- subtype (строка: reminder, informational, motivational) ОБЯЗАТЕЛЬНО для каждого элемента'
    : '- subtype (null) ОБЯЗАТЕЛЬНО для каждого элемента'
}
- Корневой JSON ДОЛЖЕН быть объектом с ключом items (НЕ массивом).
- НЕ добавляй лишние поля
- Верни только JSON, без пояснений и markdown-блоков

Пример:
{
  "items": [
    {"text": "Короткая медитация поможет перезагрузиться.", "imageTag": "meditation"${
      params.subtype === 'mixed'
        ? ', "subtype": "motivational"'
        : ', "subtype": null'
    }, "actionHint": "meditation"},
    {"text": "Сделай 3 цикла дыхания 4-7-8, чтобы быстро успокоиться.", "imageTag": "activity"${
      params.subtype === 'mixed'
        ? ', "subtype": "reminder"'
        : ', "subtype": null'
    }, "actionHint": "breathing"}
  ]
}`;
}

/**
 * Парсит и валидирует тексты из ответа AI
 */
function parseAndValidateTexts(
  content: string,
  expectedCount: number,
  options: {
    isMixed: boolean;
    allowedImageTags?: Set<ImageTag> | null;
    fallbackImageTag?: ImageTag;
    disallowHarmForPositive?: boolean;
    emojiPrefix?: string;
  }
): AiNotificationText[] {
  // Парсим JSON массив
  let items: Array<string | AiNotificationText | Record<string, unknown>> = [];
  try {
    // Убираем markdown code fences если есть
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      items = parsed as Array<
        string | AiNotificationText | Record<string, unknown>
      >;
      console.log(
        `[AI Generation] ✅ Successfully parsed JSON array: ${items.length} items found (expected: ${expectedCount})`
      );
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      items = (parsed as { items: unknown[] }).items as Array<
        string | AiNotificationText | Record<string, unknown>
      >;
      console.log(
        `[AI Generation] ✅ Successfully parsed JSON object: ${items.length} items found (expected: ${expectedCount})`
      );
    }
  } catch (error: any) {
    console.warn(
      `[AI Generation] ⚠️ JSON parse failed, trying regex fallback: ${error.message}`
    );
    // Попытка извлечь массив, если ответ содержит лишний текст.
    const arrayCandidate = extractJsonArrayCandidate(content);
    if (arrayCandidate) {
      try {
        const parsedCandidate = JSON.parse(arrayCandidate);
        if (Array.isArray(parsedCandidate)) {
          items = parsedCandidate as Array<
            string | AiNotificationText | Record<string, unknown>
          >;
          console.log(
            `[AI Generation] ✅ Extracted JSON array: ${items.length} items found (expected: ${expectedCount})`
          );
        } else if (
          parsedCandidate &&
          typeof parsedCandidate === 'object' &&
          Array.isArray((parsedCandidate as { items?: unknown }).items)
        ) {
          items = (parsedCandidate as { items: unknown[] }).items as Array<
            string | AiNotificationText | Record<string, unknown>
          >;
          console.log(
            `[AI Generation] ✅ Extracted JSON object: ${items.length} items found (expected: ${expectedCount})`
          );
        }
      } catch (candidateError: any) {
        console.warn(
          `[AI Generation] ⚠️ JSON array candidate parse failed: ${candidateError.message}`
        );
      }
    }
    // Fallback: пытаемся извлечь тексты через regex
    if (items.length === 0) {
      const matches = content.match(
        new RegExp(`"([^"]{1,${MAX_NOTIFICATION_TEXT_LENGTH}})"`, 'g')
      );
      if (matches) {
        items = matches.map((m) => m.slice(1, -1));
        console.log(
          `[AI Generation] ✅ Regex fallback found ${items.length} texts (expected: ${expectedCount})`
        );
      } else {
        console.error(
          `[AI Generation] ❌ Failed to extract texts from LLM response`
        );
      }
    }
  }

  // Валидация, нормализация и добавление эмодзи.
  return normalizeNotificationItems(items, expectedCount, options);
}

/**
 * Статус пула текстов для догенерации
 */
export interface PoolStatus {
  totalTexts: number; // Всего текстов в пуле
  usedTexts: number; // Использовано текстов
  availableTexts: number; // Доступно текстов
  daysRemaining: number; // Дней осталось (при текущем расходе)
  needsRefill: boolean; // Нужно ли пополнение
}

/**
 * Проверяет статус пула текстов и необходимость догенерации
 */
export async function checkAndRefillTextPool(
  userId: number,
  preferenceId: string,
  configHash: string,
  textsPerDay: number
): Promise<PoolStatus> {
  // 1. Загрузить текущий пул текстов
  const aiTextRecord = await loadAiGeneratedTextsWithId(
    userId,
    preferenceId,
    configHash
  );

  if (!aiTextRecord) {
    throw new Error('Text pool not found');
  }

  // 2. Определить использованные тексты
  const usedIndices = await getUsedTextIndices(aiTextRecord.id);
  const availableTexts = aiTextRecord.texts.length - usedIndices.size;

  // 3. Рассчитать дней осталось
  const daysRemaining =
    textsPerDay > 0 ? Math.floor(availableTexts / textsPerDay) : 0;

  // 4. Проверить, нужно ли пополнение (если осталось < 2 дней)
  const needsRefill = daysRemaining < 2;

  return {
    totalTexts: aiTextRecord.texts.length,
    usedTexts: usedIndices.size,
    availableTexts,
    daysRemaining,
    needsRefill,
  };
}

/**
 * Догенерирует тексты для пула с защитой от race condition (optimistic locking)
 */
export async function refillTextPool(
  userId: number,
  preferenceId: string,
  kind: 'habits' | 'therapy',
  entityKey: string,
  configHash: string,
  directness: Directness,
  subtype: HabitSubtype | null,
  textSource: 'ai',
  habitIntent?: 'quit' | 'build' | null, // Intent привычки, переданный явно
  customPromptNotification?: string | null
): Promise<GenerationResult | null> {
  let lockKey: bigint | null = null;
  let lockAcquired = false;
  try {
    lockKey = computeRefillLockKey(userId, preferenceId, configHash);
    const lockResult = await db.execute(
      sql`select pg_try_advisory_lock(${lockKey}) as locked`
    );
    const isLocked = Boolean((lockResult as any)?.rows?.[0]?.locked);
    if (!isLocked) {
      console.log(
        `[AI Generation] ⏳ Refill skipped: lock is busy (userId=${userId}, preferenceId=${preferenceId})`
      );
      return null;
    }
    lockAcquired = true;
    console.log(
      `[AI Generation] 🔒 Refill lock acquired (userId=${userId}, preferenceId=${preferenceId})`
    );

    // 1. Загружаем текущую запись под advisory lock (без удержания транзакции)
    const [currentRecord] = await db
      .select()
      .from(aiGeneratedNotificationTexts)
      .where(
        and(
          eq(aiGeneratedNotificationTexts.userId, userId),
          eq(aiGeneratedNotificationTexts.preferenceId, preferenceId),
          eq(aiGeneratedNotificationTexts.generationConfigHash, configHash)
        )
      )
      .limit(1);

    if (!currentRecord) {
      console.warn(
        `[AI Generation] ⚠️ Text pool not found for refill: userId=${userId}, preferenceId=${preferenceId}, configHash=${configHash.substring(0, 8)}...`
      );
      return null;
    }

    // 2. Проверяем использованные тексты
    const usedIndicesNow = await getUsedTextIndices(currentRecord.id);
    const currentTexts = currentRecord.texts as Array<
      string | AiNotificationText
    >;
    const availableTexts = currentTexts.length - usedIndicesNow.size;

    // 3. Определяем, сколько нужно догенерировать
    const targetCount = DEFAULT_TEXT_COUNT; // 50 текстов
    const toGenerate = Math.max(0, targetCount - availableTexts);

    if (toGenerate === 0) {
      console.log(
        `[AI Generation] ✅ Pool is full (${availableTexts}/${targetCount} available), no need to refill`
      );
      return null;
    }

    console.log(
      `[AI Generation] 🔄 Refilling pool: ${availableTexts}/${targetCount} available, need to generate ${toGenerate} texts`
    );

    // 4. Генерируем новые тексты
    // ВАЖНО: для догенерации нужно создавать только новые тексты, даже если старые есть
    // Поэтому загружаем данные о сущности и генерируем напрямую через LLM
    // (generateNotificationTexts может вернуть существующие, если они есть)

    // 4.1. Загружаем данные о сущности для промпта
    let entityName = '';
    let entityDescription: string | null = null;
    let isCustomEntity = false;
    // Используем переданный intent, если он есть, иначе определяем из БД/каталога
    let currentHabitIntent: 'quit' | 'build' | null = habitIntent ?? null;

    if (kind === 'habits') {
      // Для кастомных сущностей entityKey = ID
      const [habit] = await db
        .select()
        .from(habits)
        .where(
          and(
            eq(habits.id, entityKey), // Для кастомных сущностей entityKey = ID
            eq(habits.userId, userId)
          )
        )
        .limit(1);

      if (habit) {
        isCustomEntity = true;
        entityName = habit.name;
        entityDescription = habit.description;
        // Используем переданный intent, если он есть, иначе берем из БД
        if (!currentHabitIntent) {
          currentHabitIntent = habit.intent as 'quit' | 'build' | null;
        }
      } else {
        const { findHabitByKey } = await import('@/app/lib/habitsCatalog');
        const catalogHabit = findHabitByKey(entityKey);
        // Используем читаемое название из каталога для готовых шаблонов
        entityName = catalogHabit ? catalogHabit.name : entityKey;
        // Используем intent из каталога, если не передан явно
        if (!currentHabitIntent) {
          currentHabitIntent = catalogHabit ? catalogHabit.intent : null;
        }
        // Fallback только если intent не определен нигде
        if (!currentHabitIntent) {
          currentHabitIntent = inferHabitIntentFromName(entityName);
        }
      }
    } else {
      const [topic] = await db
        .select()
        .from(therapyTopicsCustom)
        .where(
          and(
            eq(therapyTopicsCustom.id, entityKey),
            eq(therapyTopicsCustom.userId, userId)
          )
        )
        .limit(1);

      if (topic) {
        isCustomEntity = true;
        entityName = topic.name;
        entityDescription = topic.description;
      } else {
        entityName = entityKey;
      }
    }

    const effectiveCustomPromptNotification = isCustomEntity
      ? null
      : normalizeCustomPromptNotification(customPromptNotification);

    // 4.2. Загружаем настройки пользователя
    const [userPrefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const tone = resolveTone(userPrefs?.tone as string | null | undefined);
    const addressing: Addressing =
      (userPrefs?.addressing as Addressing) || 'informal';

    const [userProfile] = await db
      .select({ gender: users.gender })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const userGender =
      userProfile?.gender === 'male' || userProfile?.gender === 'female'
        ? userProfile.gender
        : null;

    const imageTagPolicy = buildImageTagPolicy({
      entityKey,
      entityName,
      kind,
    });

    // 4.3. Строим промпт и генерируем только новые тексты через LLM
    const emojiPrefix = resolveAiEmojiPrefix(isCustomEntity);
    const maxBodyLength = resolveMaxNotificationBodyLength(emojiPrefix);
    const systemPrompt = buildNotificationSystemPrompt({
      entityKey,
      entityName,
      description: entityDescription,
      tone,
      addressing,
      userGender,
      directness,
      subtype,
      kind,
      habitIntent: currentHabitIntent, // Передаем intent для формирования правильных инструкций
      imageTagPolicy,
      customPromptNotification: effectiveCustomPromptNotification,
      emojiPrefix,
      maxBodyLength,
      isCustomEntity,
    });

    const provider = config.llm.defaultProvider;
    const model = config.llm.openai.models.notifications;
    const estimatedCost = estimateGenerationCost(toGenerate, model);

    if (estimatedCost > config.llm.limits.maxRequestUSD) {
      console.warn(
        `[AI Generation] ⚠️ Estimated cost ($${estimatedCost.toFixed(6)}) exceeds limit, skipping refill`
      );
      return null;
    }

    console.log(
      `[AI Generation] 💰 Refill estimated cost: $${estimatedCost.toFixed(6)} for ${toGenerate} texts`
    );

    // Генерируем батчами, чтобы снизить риск таймаутов/502
    const scenarioSettings = config.llm.openai.settings.notifications;
    const batchResult = await generateNotificationItemsBatched({
      provider,
      model,
      systemPrompt,
      totalCount: toGenerate,
      scenarioSettings,
      isMixed: subtype === 'mixed',
      imageTagPolicy,
      emojiPrefix,
    });

    const newTexts = batchResult.items;

    if (newTexts.length === 0) {
      console.warn(
        `[AI Generation] ⚠️ Failed to generate new texts for refill`
      );
      return null;
    }
    if (newTexts.length < toGenerate) {
      console.warn(
        `[AI Generation] ⚠️ Refill produced only ${newTexts.length}/${toGenerate} texts, accepting partial result`
      );
    }

    // Фильтруем дубликаты по содержанию, чтобы не раздувать пул одинаковыми текстами.
    const existingHashes = new Set(
      currentTexts.map((text) => hashNotificationText(extractTextValue(text)))
    );
    const uniqueTexts = newTexts.filter((text) => {
      const textHash = hashNotificationText(text.text);
      if (existingHashes.has(textHash)) {
        return false;
      }
      existingHashes.add(textHash);
      return true;
    });

    if (uniqueTexts.length === 0) {
      console.warn(
        `[AI Generation] ⚠️ Refill produced only duplicates, skipping update`
      );
      return null;
    }
    if (uniqueTexts.length < newTexts.length) {
      console.warn(
        `[AI Generation] ⚠️ Refill deduped ${newTexts.length - uniqueTexts.length} duplicate text(s)`
      );
    }

    // 4.5. Вычисляем стоимость
    const promptText =
      systemPrompt +
      `\nСгенерируй ДО ${toGenerate} вариантов уведомлений в формате JSON объекта с полем items (массив объектов). Каждый текст должен быть примерно 140-${maxBodyLength} символов (сервер добавит префикс "${emojiPrefix}").`;
    const tokensIn = Math.ceil(promptText.length / 4);
    const tokensOut = Math.ceil(
      newTexts.reduce((sum, text) => sum + text.text.length, 0) / 4
    );
    const actualTokensUsed = tokensIn + tokensOut;
    const actualCostUsd = estimateCostUSD({
      provider: 'openai',
      model: batchResult.model || model,
      tokensIn,
      tokensOut,
    });

    const result: GenerationResult = {
      texts: uniqueTexts,
      provider,
      model: batchResult.model || model,
      tokensUsed: actualTokensUsed,
      costUsd: actualCostUsd,
    };

    // 5. Обновляем запись с проверкой, что тексты не изменились
    // Используем optimistic locking: проверяем, что текущие тексты совпадают
    // КРИТИЧНО: НЕ удаляем использованные тексты из массива, только дописываем новые в конец
    // Иначе индексы в aiNotificationTextUsage станут невалидными (тексты сдвинутся)
    const updated = await db
      .update(aiGeneratedNotificationTexts)
      .set({
        texts: [...currentTexts, ...result.texts], // Просто дописываем новые тексты в конец
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(aiGeneratedNotificationTexts.id, currentRecord.id),
          // Проверяем, что количество текстов не изменилось (защита от race condition)
          sql`jsonb_array_length(${aiGeneratedNotificationTexts.texts}) = ${currentTexts.length}`
        )
      )
      .returning();

    if (updated.length === 0) {
      // Кто-то другой обновил данные - пропускаем
      console.warn(
        `[AI Generation] ⚠️ Pool was updated by another process during refill, skipping update`
      );
      return null;
    }

    console.log(
      `[AI Generation] ✅ Pool refilled successfully: generated ${result.texts.length} texts, total now: ${(updated[0].texts as Array<string | AiNotificationText>).length}`
    );

    return result;
  } catch (error) {
    console.error(`[AI Generation] ❌ Error refilling text pool:`, error);
    // Не прерываем выполнение при ошибке догенерации
    return null;
  } finally {
    if (lockAcquired && lockKey !== null) {
      try {
        await db.execute(
          sql`select pg_advisory_unlock(${lockKey}) as unlocked`
        );
      } catch (unlockError) {
        console.error(
          `[AI Generation] ⚠️ Failed to release advisory lock:`,
          unlockError
        );
      }
    }
  }
}
