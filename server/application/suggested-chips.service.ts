import { chatViaProvider } from '@/server/application/llm.service';
import { config } from '@/server/config';
import {
  SuggestedChipDto,
  SuggestedChipsPayloadDto,
  SuggestedChipIntentEnum,
  SuggestedChipActionEnum,
  SuggestedChipKindEnum,
  SuggestedChipActionParamsDto,
  type ChatEntryContext,
  type SuggestedChip,
  type SuggestedChipIntent,
  type SuggestedChipKind,
  type SuggestedChipAction,
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

function normalizeKind(value: string | undefined): SuggestedChipKind {
  if (!value) return 'text';
  const parsed = SuggestedChipKindEnum.safeParse(value);
  return parsed.success ? parsed.data : 'text';
}

function normalizeAction(
  value: string | undefined
): SuggestedChipAction | null {
  if (!value) return null;
  const parsed = SuggestedChipActionEnum.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeActionParams(
  action: SuggestedChipAction,
  params: unknown
):
  | {
      trackId?: string;
      collectionId?: string;
      sosEntry?: 'panic' | 'tension' | 'technique_picker';
      source?: 'chat';
    }
  | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const raw = params as Record<string, unknown>;
  const normalized = {
    trackId: typeof raw.trackId === 'string' ? raw.trackId : undefined,
    collectionId:
      typeof raw.collectionId === 'string' ? raw.collectionId : undefined,
    sosEntry: typeof raw.sosEntry === 'string' ? raw.sosEntry : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  };
  const parsed = SuggestedChipActionParamsDto.safeParse(normalized);
  if (!parsed.success) return undefined;

  if (action === 'open_meditation_track' && !parsed.data.trackId) {
    return undefined;
  }
  if (action === 'open_meditations_collection' && !parsed.data.collectionId) {
    return undefined;
  }
  if (action === 'open_sos' && !parsed.data.sosEntry) {
    return undefined;
  }
  return parsed.data;
}

function normalizeChip(raw: {
  text?: string;
  intent?: string;
  kind?: string;
  action?: string;
  params?: unknown;
}): SuggestedChip | null {
  const text = String(raw?.text || '')
    .trim()
    .replace(/^["«»]+|["«»]+$/g, '');
  if (!text || text.length > 80) return null;

  const intent = normalizeIntent(raw?.intent);
  const kind = normalizeKind(raw?.kind);

  if (kind === 'action') {
    const action = normalizeAction(raw?.action);
    if (!action) return null;
    const params = normalizeActionParams(action, raw?.params);
    if (action === 'open_meditation_track' && !params?.trackId) {
      return null;
    }
    if (action === 'open_meditations_collection' && !params?.collectionId) {
      return null;
    }
    if (action === 'open_sos' && !params?.sosEntry) {
      return null;
    }
    return SuggestedChipDto.safeParse({
      text,
      intent,
      kind,
      action,
      params,
    }).success
      ? { text, intent, kind, action, params }
      : null;
  }

  return SuggestedChipDto.safeParse({
    text,
    intent,
    kind,
  }).success
    ? { text, intent, kind }
    : null;
}

function filterBySimilarity(chips: SuggestedChip[], recentChips: string[]) {
  const unique: SuggestedChip[] = [];
  const actionKeys = new Set<string>();

  for (const chip of chips) {
    if (chip.kind === 'action') {
      const actionKey = `${chip.action || 'action'}:${chip.params?.trackId || ''}:${chip.params?.collectionId || ''}:${chip.params?.sosEntry || ''}:${chip.params?.source || ''}`;
      if (actionKeys.has(actionKey)) continue;
      actionKeys.add(actionKey);
      unique.push(chip);
      continue;
    }

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
  const body = (fenced?.[1] ?? text).trim();

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function normalizeChipsPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.chips)) return payload;

  const chips = record.chips.map((chip) => {
    if (!chip || typeof chip !== 'object') return chip;
    const chipRecord = { ...(chip as Record<string, unknown>) };

    // Убираем null-поля, чтобы Zod не отбрасывал валидные чипы.
    if (chipRecord.action === null) {
      delete chipRecord.action;
    }

    const params = chipRecord.params;
    if (params === null || typeof params !== 'object') {
      delete chipRecord.params;
    } else {
      const paramsRecord = { ...(params as Record<string, unknown>) };
      if (paramsRecord.trackId === null) {
        delete paramsRecord.trackId;
      }
      if (paramsRecord.collectionId === null) {
        delete paramsRecord.collectionId;
      }
      if (Object.keys(paramsRecord).length === 0) {
        delete chipRecord.params;
      } else {
        chipRecord.params = paramsRecord;
      }
    }

    return chipRecord;
  });

  return {
    ...record,
    chips,
  };
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

  const cleanedPayload = normalizeChipsPayload(normalizedPayload);
  const parsed = SuggestedChipsPayloadDto.safeParse(cleanedPayload);
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

  if (entryContext.type === 'sos') {
    const labelMap: Record<typeof entryContext.sos_entry, string> = {
      panic: 'тревога',
      tension: 'напряжение',
      vent: 'выговориться',
    };
    return labelMap[entryContext.sos_entry] || 'sos';
  }

  if (entryContext.type === 'thought_dump') {
    const normalizedDump = normalizeText(entryContext.dump_text);
    if (!normalizedDump) return 'мысли';

    const keywordMap: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /(тревог|паник)/, label: 'тревога' },
      { pattern: /(злост|злюс|раздраж)/, label: 'злость' },
      { pattern: /(страх|страш)/, label: 'страх' },
      { pattern: /(напряж|стресс)/, label: 'напряжение' },
      { pattern: /(устал|выгор|сил нет)/, label: 'усталость' },
      { pattern: /(вина|виноват)/, label: 'вина' },
      { pattern: /(стыд|стыдно)/, label: 'стыд' },
      { pattern: /(обид)/, label: 'обида' },
      { pattern: /(одиноч|одиноко)/, label: 'одиночество' },
      { pattern: /(контрол)/, label: 'контроль' },
    ];

    const matched = keywordMap.find((item) =>
      item.pattern.test(normalizedDump)
    );
    if (matched) {
      return matched.label;
    }

    const stopWords = new Set([
      'я',
      'мне',
      'меня',
      'что',
      'это',
      'как',
      'потому',
      'сейчас',
      'очень',
      'просто',
      'совсем',
      'когда',
      'только',
    ]);
    const fallbackToken = normalizedDump
      .split(' ')
      .find((token) => token.length >= 4 && !stopWords.has(token));

    return fallbackToken || 'мысли';
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
  if (
    params.entryContext?.type === 'sos' &&
    params.entryContext.sos_entry === 'vent' &&
    params.messages.length === 0
  ) {
    const sosChips: SuggestedChip[] = [
      {
        text: 'Мне тревожно',
        intent: 'support',
        kind: 'action',
        action: 'open_sos',
        params: { sosEntry: 'panic', source: 'chat' },
      },
      {
        text: 'Снять напряжение',
        intent: 'action_step',
        kind: 'action',
        action: 'open_sos',
        params: { sosEntry: 'tension', source: 'chat' },
      },
      {
        text: 'Дай короткую технику',
        intent: 'action_step',
        kind: 'action',
        action: 'open_sos',
        params: { sosEntry: 'technique_picker', source: 'chat' },
      },
    ];
    return sosChips;
  }

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
