import { chatViaProvider } from '@/server/application/llm.service';
import { config } from '@/server/config';
import {
  SuggestedChipDto,
  SuggestedChipsPayloadDto,
  SuggestedChipIntentEnum,
  type ChatEntryContext,
  type SuggestedChip,
  type SuggestedChipIntent,
} from '@/shared/dto';
import {
  buildSuggestedChipsUserPrompt,
  suggestedChipsSystemPrompt,
  suggestedChipsDeveloperPrompt,
} from '@/server/application/prompts';
import {
  addRecentChips,
  getRecentChips,
} from '@/server/utils/suggestedChipsStore';

const MAX_CHIPS = 4;
const MIN_CHIPS = 3;
const MAX_CONTEXT_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 320;
const SIMILARITY_WITHIN_SET = 0.82;
const SIMILARITY_WITH_HISTORY = 0.88;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBigrams(text: string): string[] {
  const normalized = normalizeText(text).replace(/\s/g, '');
  if (normalized.length < 2) return [];
  const grams: string[] = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.push(normalized.slice(i, i + 2));
  }
  return grams;
}

function diceSimilarity(a: string, b: string): number {
  const aGrams = toBigrams(a);
  const bGrams = toBigrams(b);
  if (!aGrams.length || !bGrams.length) return 0;

  const bSet = new Set(bGrams);
  let intersection = 0;
  for (const gram of aGrams) {
    if (bSet.has(gram)) intersection += 1;
  }

  return (2 * intersection) / (aGrams.length + bGrams.length);
}

function isTooSimilar(a: string, b: string, threshold: number): boolean {
  return diceSimilarity(a, b) >= threshold;
}

function normalizeIntent(value: string | undefined): SuggestedChipIntent {
  if (!value) return 'clarify';
  const parsed = SuggestedChipIntentEnum.safeParse(value);
  return parsed.success ? parsed.data : 'clarify';
}

function normalizeChip(raw: {
  text?: string;
  intent?: string;
}): SuggestedChip | null {
  const text = String(raw?.text || '')
    .trim()
    .replace(/^["«»]+|["«»]+$/g, '');
  if (!text || text.length > 80) return null;

  const intent = normalizeIntent(raw?.intent);
  return SuggestedChipDto.safeParse({
    text,
    intent,
  }).success
    ? { text, intent }
    : null;
}

function filterBySimilarity(chips: SuggestedChip[], recentChips: string[]) {
  const unique: SuggestedChip[] = [];

  for (const chip of chips) {
    const hasDupInSet = unique.some((existing) =>
      isTooSimilar(existing.text, chip.text, SIMILARITY_WITHIN_SET)
    );
    if (hasDupInSet) continue;

    const hasDupInHistory = recentChips.some((recent) =>
      isTooSimilar(recent, chip.text, SIMILARITY_WITH_HISTORY)
    );
    if (hasDupInHistory) continue;

    unique.push(chip);
  }

  return unique.slice(0, MAX_CHIPS);
}

function hasEnoughIntentDiversity(
  chips: Array<{ intent: SuggestedChipIntent }>
) {
  const intents = new Set(chips.map((chip) => chip.intent));
  if (chips.length >= 4) {
    return intents.size >= 3;
  }
  return intents.size >= 2 || chips.length <= 2;
}

function trimMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => String(m.content || '').trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, MAX_MESSAGE_LENGTH),
    }))
    .slice(-MAX_CONTEXT_MESSAGES);
}

function buildDialogContext(messages: ChatMessage[]): string {
  const trimmed = trimMessages(messages);
  if (!trimmed.length) return '';

  return trimmed
    .map((m) =>
      m.role === 'user'
        ? `Пользователь: ${m.content}`
        : `Ассистент: ${m.content}`
    )
    .join('\n');
}

function buildRecentChipsList(chips: string[]): string {
  if (!chips.length) return 'Нет';
  return chips.map((chip) => `- ${chip}`).join('\n');
}

function parseJsonPayload(raw: string): unknown {
  const text = String(raw || '').trim();
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function requestChipsFromModel(params: {
  dialogContext: string;
  assistantAnswer: string;
  recentChips: string[];
  primaryTopic?: string;
  maxChips: number;
  retry?: boolean;
}): Promise<SuggestedChip[]> {
  const userPrompt = buildSuggestedChipsUserPrompt({
    dialog_context: params.dialogContext,
    assistant_answer: params.assistantAnswer,
    recent_chips: buildRecentChipsList(params.recentChips),
    primary_topic: params.primaryTopic,
    max_chips: params.maxChips,
    retry: params.retry,
  });

  const result = await chatViaProvider({
    provider: 'openai',
    model: config.llm.openai.models.chips,
    messages: [
      { role: 'system', content: suggestedChipsSystemPrompt },
      { role: 'developer', content: suggestedChipsDeveloperPrompt },
      { role: 'user', content: userPrompt },
    ],
    options: {
      scenario: 'chips',
    },
  });

  const payload = parseJsonPayload(result.content);
  // Нормализуем payload: подрезаем массив, чтобы не падать на > MAX_CHIPS.
  const normalizedPayload =
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { chips?: unknown }).chips)
      ? {
          ...(payload as Record<string, unknown>),
          chips: (payload as { chips: unknown[] }).chips.slice(0, MAX_CHIPS),
        }
      : payload;

  const parsed = SuggestedChipsPayloadDto.safeParse(normalizedPayload);
  if (!parsed.success) return [];

  return parsed.data.chips;
}

function resolveChipsKey(params: {
  sessionId?: string;
  userId?: number | string;
  therapySessionId?: number | null;
}) {
  if (params.sessionId) return `session:${params.sessionId}`;
  if (params.therapySessionId) return `therapy:${params.therapySessionId}`;
  if (params.userId) return `user:${params.userId}`;
  return null;
}

function resolvePrimaryTopic(entryContext?: ChatEntryContext | null): string {
  if (!entryContext) return '';

  if (entryContext.type === 'habit') {
    return (
      entryContext.habit_name || entryContext.habit_description || 'привычка'
    );
  }

  if (entryContext.type === 'therapy_topic') {
    return entryContext.topic_name || entryContext.topic_description || 'тема';
  }

  return '';
}

function hasPrimaryTopic(
  chips: SuggestedChip[],
  primaryTopic: string
): boolean {
  if (!primaryTopic) return true;
  const normalizedTopic = normalizeText(primaryTopic);
  if (!normalizedTopic) return true;

  return chips.some((chip) =>
    normalizeText(chip.text).includes(normalizedTopic)
  );
}

function hasEnoughShortChips(chips: Array<{ text: string }>) {
  return chips.filter((chip) => chip.text.length <= 40).length >= 2;
}

export async function generateSuggestedChips(params: {
  messages: ChatMessage[];
  assistantAnswer: string;
  sessionId?: string;
  userId?: number | string;
  therapySessionId?: number | null;
  entryContext?: ChatEntryContext | null;
}) {
  const answer = String(params.assistantAnswer || '').trim();
  if (!answer) return [];

  // Ограничиваем длину ответа, чтобы не раздувать промпт.
  const answerForPrompt = answer.slice(0, 1200);
  const dialogContext = buildDialogContext(params.messages);
  const chipsKey = resolveChipsKey(params);
  const recent = chipsKey ? getRecentChips(chipsKey) : [];
  const primaryTopic = resolvePrimaryTopic(params.entryContext);

  let chips: SuggestedChip[] = [];
  try {
    chips = await requestChipsFromModel({
      dialogContext,
      assistantAnswer: answerForPrompt,
      recentChips: recent,
      primaryTopic,
      maxChips: MAX_CHIPS,
    });
  } catch (error) {
    console.error('[SuggestedChips] Failed to generate chips:', error);
    return [];
  }

  const baseNormalized = chips
    .map((chip) => normalizeChip(chip))
    .filter((chip): chip is SuggestedChip => chip !== null);
  const filteredNormalized = filterBySimilarity(baseNormalized, recent);
  let normalized = filteredNormalized;

  if (
    normalized.length < MIN_CHIPS ||
    !hasEnoughIntentDiversity(normalized) ||
    !hasPrimaryTopic(normalized, primaryTopic) ||
    !hasEnoughShortChips(normalized)
  ) {
    let retryChips: SuggestedChip[] = [];
    try {
      retryChips = await requestChipsFromModel({
        dialogContext,
        assistantAnswer: answerForPrompt,
        recentChips: recent,
        primaryTopic,
        maxChips: MAX_CHIPS,
        retry: true,
      });
    } catch (error) {
      console.error('[SuggestedChips] Retry failed:', error);
      retryChips = [];
    }

    const retryNormalized = retryChips
      .map((chip) => normalizeChip(chip))
      .filter((chip): chip is SuggestedChip => chip !== null);
    const retryFiltered = filterBySimilarity(retryNormalized, recent);

    if (retryFiltered.length >= MIN_CHIPS) {
      normalized = retryFiltered;
    }
  }

  if (!normalized.length) {
    return [];
  }

  normalized = filterBySimilarity(normalized, recent);

  if (chipsKey) {
    // Сохраняем историю чипов для анти-повторов.
    addRecentChips(
      chipsKey,
      normalized.map((chip) => chip.text)
    );
  }

  return normalized.slice(0, MAX_CHIPS);
}
