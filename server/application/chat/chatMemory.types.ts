import { z } from 'zod';
import {
  DURABLE_MEMORY_PROMPT_BUDGET_MAX_CHARS,
  DURABLE_MEMORY_PROMPT_ITEM_MAX_CHARS,
  DURABLE_MEMORY_PROMPT_MAX_CONTEXT,
  DURABLE_MEMORY_PROMPT_MAX_FACTS,
  DURABLE_MEMORY_PROMPT_MAX_PREFERENCES,
  DURABLE_MEMORY_PROMPT_NAME_MAX_CHARS,
} from './durableUserMemoryPromptBudget';

export const riskStateSchema = z.enum(['none', 'watch', 'elevated']);
export const DURABLE_USER_MEMORY_SCHEMA_VERSION = 1;

export const handoffSummarySchema = z.object({
  schemaVersion: z.literal(1),
  sessionOverviewShort: z.string().max(700),
  themesActive: z.array(z.string().max(120)).max(8),
  patternsOrTriggers: z.array(z.string().max(180)).max(8),
  helpfulInterventions: z.array(z.string().max(220)).max(8),
  unfinishedThreads: z.array(z.string().max(220)).max(8),
  riskState: riskStateSchema,
  nextSessionGuidance: z.array(z.string().max(220)).max(6),
});

export type SessionHandoffSummary = z.infer<typeof handoffSummarySchema>;

export const runtimeCompactStateSchema = z.object({
  schemaVersion: z.literal(1),
  compactOverview: z.string().max(600),
  activeThemes: z.array(z.string().max(120)).max(8),
  activePatterns: z.array(z.string().max(180)).max(8),
  helpfulInterventions: z.array(z.string().max(220)).max(8),
  unfinishedThreads: z.array(z.string().max(220)).max(8),
  riskState: riskStateSchema,
  nextTurnGuidance: z.array(z.string().max(220)).max(6),
});

export type RuntimeCompactState = z.infer<typeof runtimeCompactStateSchema>;

export const durableUserMemorySchema = z.object({
  schemaVersion: z.literal(DURABLE_USER_MEMORY_SCHEMA_VERSION),
  name: z.string(),
  facts: z.array(z.string()),
  preferences: z.array(z.string()),
  context: z.array(z.string()),
});

export type DurableUserMemory = z.infer<typeof durableUserMemorySchema>;

type DurableUserMemoryRawRecord = Record<string, unknown> & {
  v?: unknown;
  n?: unknown;
  f?: unknown;
  p?: unknown;
  g?: unknown;
  schemaVersion?: unknown;
  name?: unknown;
  facts?: unknown;
  preferences?: unknown;
  context?: unknown;
};

type HandoffSummaryRawRecord = Record<string, unknown> & {
  sessionOverviewShort?: unknown;
  themesActive?: unknown;
  patternsOrTriggers?: unknown;
  helpfulInterventions?: unknown;
  unfinishedThreads?: unknown;
  riskState?: unknown;
  nextSessionGuidance?: unknown;
};

function normalizeCompactMemoryRaw(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(пользователь|user|client)\s+/i, '')
    .replace(/^[,;:.!?'"`«»()[\]{}\-–—]+|[,;:.!?'"`«»()[\]{}\-–—]+$/g, '');
}

function trimCompactMemoryAtom(value: string, maxChars?: number): string {
  const normalized = normalizeCompactMemoryRaw(value);
  if (typeof maxChars === 'number' && maxChars > 0) {
    return normalized.slice(0, maxChars).trim();
  }

  return normalized;
}

function normalizeDurableName(value: unknown, maxChars?: number): string {
  const normalized = trimCompactMemoryAtom(String(value || ''), maxChars);
  const genericNames = new Set([
    '',
    'пользователь',
    'user',
    'client',
    'клиент',
    'person',
    'human',
  ]);

  return genericNames.has(normalized.toLowerCase()) ? '' : normalized;
}

function normalizeRiskState(value: unknown): z.infer<typeof riskStateSchema> {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (normalized === 'watch' || normalized === 'elevated') {
    return normalized;
  }

  return 'none';
}

function normalizeCompactMemoryList(
  value: unknown,
  options?: {
    maxItems?: number;
    maxChars?: number;
  }
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const next = trimCompactMemoryAtom(String(item || ''), options?.maxChars);
    if (!next) {
      continue;
    }

    const dedupeKey = next.toLowerCase();
    if (deduped.has(dedupeKey)) {
      continue;
    }

    deduped.add(dedupeKey);
    normalized.push(next);

    if (
      typeof options?.maxItems === 'number' &&
      options.maxItems > 0 &&
      normalized.length >= options.maxItems
    ) {
      break;
    }
  }

  return normalized;
}

function limitPromptMemoryList(values: string[], maxItems: number): string[] {
  return limitMemoryList(
    values,
    maxItems,
    DURABLE_MEMORY_PROMPT_ITEM_MAX_CHARS
  );
}

function limitMemoryList(
  values: string[],
  maxItems: number,
  maxChars: number
): string[] {
  const normalized = normalizeCompactMemoryList(values, {
    maxChars,
  });

  if (normalized.length <= maxItems) {
    return normalized;
  }

  const headCount = Math.ceil(maxItems * 0.6);
  const tailCount = Math.max(0, maxItems - headCount);

  return normalizeCompactMemoryList(
    [
      ...normalized.slice(0, headCount),
      ...normalized.slice(Math.max(headCount, normalized.length - tailCount)),
    ],
    {
      maxItems,
      maxChars,
    }
  );
}

export function fitDurableUserMemoryToBudget(
  memory: DurableUserMemory
): DurableUserMemory {
  return durableUserMemorySchema.parse({
    schemaVersion: DURABLE_USER_MEMORY_SCHEMA_VERSION,
    name: normalizeDurableName(memory.name),
    facts: normalizeCompactMemoryList(memory.facts),
    preferences: normalizeCompactMemoryList(memory.preferences),
    context: normalizeCompactMemoryList(memory.context),
  });
}

export function fitDurableUserMemoryForPrompt(
  memory: DurableUserMemory
): DurableUserMemory {
  const normalized = fitDurableUserMemoryToBudget(memory);

  return durableUserMemorySchema.parse({
    schemaVersion: DURABLE_USER_MEMORY_SCHEMA_VERSION,
    name: normalizeDurableName(
      normalized.name,
      DURABLE_MEMORY_PROMPT_NAME_MAX_CHARS
    ),
    facts: limitPromptMemoryList(
      normalized.facts,
      DURABLE_MEMORY_PROMPT_MAX_FACTS
    ),
    preferences: limitPromptMemoryList(
      normalized.preferences,
      DURABLE_MEMORY_PROMPT_MAX_PREFERENCES
    ),
    context: limitPromptMemoryList(
      normalized.context,
      DURABLE_MEMORY_PROMPT_MAX_CONTEXT
    ),
  });
}

type PromptDurableUserMemoryPayload = {
  n?: string;
  f?: string[];
  p?: string[];
  c?: string[];
};

function buildPromptDurableUserMemoryPayload(
  memory: DurableUserMemory
): PromptDurableUserMemoryPayload {
  return {
    ...(memory.name ? { n: memory.name } : {}),
    ...(memory.facts.length ? { f: memory.facts } : {}),
    ...(memory.preferences.length ? { p: memory.preferences } : {}),
    ...(memory.context.length ? { c: memory.context } : {}),
  };
}

function fitDurableUserMemoryForPromptBudget(
  memory: DurableUserMemory,
  options?: {
    maxChars?: number;
    prefixChars?: number;
  }
): DurableUserMemory {
  const maxChars = options?.maxChars ?? DURABLE_MEMORY_PROMPT_BUDGET_MAX_CHARS;
  const prefixChars = options?.prefixChars ?? 0;
  const projected = fitDurableUserMemoryForPrompt(memory);
  const next: DurableUserMemory = {
    ...projected,
    facts: [...projected.facts],
    preferences: [...projected.preferences],
    context: [...projected.context],
  };

  const fitsBudget = () =>
    prefixChars +
      JSON.stringify(buildPromptDurableUserMemoryPayload(next)).length <=
    maxChars;

  if (fitsBudget()) {
    return next;
  }

  const shrinkOrder: Array<'context' | 'preferences' | 'facts'> = [
    'context',
    'preferences',
    'facts',
  ];

  while (shrinkOrder.some((key) => next[key].length > 0) && !fitsBudget()) {
    const targetKey = shrinkOrder.find((key) => next[key].length > 0);
    if (!targetKey) {
      break;
    }

    next[targetKey].pop();
  }

  if (!fitsBudget() && next.name) {
    next.name = '';
  }

  return next;
}

export function normalizeDurableUserMemory(raw: unknown): DurableUserMemory {
  const record =
    raw && typeof raw === 'object' ? (raw as DurableUserMemoryRawRecord) : {};

  return fitDurableUserMemoryToBudget({
    schemaVersion: DURABLE_USER_MEMORY_SCHEMA_VERSION,
    name: normalizeDurableName(record.name ?? record.n),
    facts: normalizeCompactMemoryList(record.facts ?? record.f),
    preferences: normalizeCompactMemoryList(record.preferences ?? record.p),
    context: normalizeCompactMemoryList(record.context ?? record.g),
  });
}

export function createEmptyDurableUserMemory(): DurableUserMemory {
  return {
    schemaVersion: DURABLE_USER_MEMORY_SCHEMA_VERSION,
    name: '',
    facts: [],
    preferences: [],
    context: [],
  };
}

export function hasMeaningfulDurableUserMemory(
  memory: DurableUserMemory | null | undefined
): boolean {
  if (!memory) {
    return false;
  }

  return (
    memory.name.trim().length > 0 ||
    memory.facts.some((item) => item.trim().length > 0) ||
    memory.preferences.some((item) => item.trim().length > 0) ||
    memory.context.some((item) => item.trim().length > 0)
  );
}

export function createEmptyHandoffSummary(): SessionHandoffSummary {
  return {
    schemaVersion: 1,
    sessionOverviewShort: '',
    themesActive: [],
    patternsOrTriggers: [],
    helpfulInterventions: [],
    unfinishedThreads: [],
    riskState: 'none',
    nextSessionGuidance: [],
  };
}

export function normalizeHandoffSummary(raw: unknown): SessionHandoffSummary {
  const record =
    raw && typeof raw === 'object' ? (raw as HandoffSummaryRawRecord) : {};

  return handoffSummarySchema.parse({
    schemaVersion: 1,
    sessionOverviewShort: trimCompactMemoryAtom(
      String(record.sessionOverviewShort || ''),
      700
    ),
    themesActive: normalizeCompactMemoryList(record.themesActive, {
      maxItems: 8,
      maxChars: 120,
    }),
    patternsOrTriggers: normalizeCompactMemoryList(record.patternsOrTriggers, {
      maxItems: 8,
      maxChars: 180,
    }),
    helpfulInterventions: normalizeCompactMemoryList(
      record.helpfulInterventions,
      {
        maxItems: 8,
        maxChars: 220,
      }
    ),
    unfinishedThreads: normalizeCompactMemoryList(record.unfinishedThreads, {
      maxItems: 8,
      maxChars: 220,
    }),
    riskState: normalizeRiskState(record.riskState),
    nextSessionGuidance: normalizeCompactMemoryList(
      record.nextSessionGuidance,
      {
        maxItems: 6,
        maxChars: 220,
      }
    ),
  });
}

type PromptHandoffSummaryPayload = {
  sessionOverviewShort?: string;
  themesActive?: string[];
  patternsOrTriggers?: string[];
  helpfulInterventions?: string[];
  unfinishedThreads?: string[];
  riskState?: SessionHandoffSummary['riskState'];
  nextSessionGuidance?: string[];
};

function buildPromptHandoffSummaryPayload(
  summary: SessionHandoffSummary
): PromptHandoffSummaryPayload {
  const normalized = normalizeHandoffSummary(summary);

  return {
    ...(normalized.sessionOverviewShort
      ? { sessionOverviewShort: normalized.sessionOverviewShort }
      : {}),
    ...(normalized.themesActive.length
      ? { themesActive: normalized.themesActive }
      : {}),
    ...(normalized.patternsOrTriggers.length
      ? { patternsOrTriggers: normalized.patternsOrTriggers }
      : {}),
    ...(normalized.helpfulInterventions.length
      ? { helpfulInterventions: normalized.helpfulInterventions }
      : {}),
    ...(normalized.unfinishedThreads.length
      ? { unfinishedThreads: normalized.unfinishedThreads }
      : {}),
    ...(normalized.riskState !== 'none'
      ? { riskState: normalized.riskState }
      : {}),
    ...(normalized.nextSessionGuidance.length
      ? { nextSessionGuidance: normalized.nextSessionGuidance }
      : {}),
  };
}

export function createEmptyRuntimeCompactState(): RuntimeCompactState {
  return {
    schemaVersion: 1,
    compactOverview: '',
    activeThemes: [],
    activePatterns: [],
    helpfulInterventions: [],
    unfinishedThreads: [],
    riskState: 'none',
    nextTurnGuidance: [],
  };
}

export function serializeHandoffSummaryForPrompt(
  summary: SessionHandoffSummary
): string {
  return `Handoff прошлой сессии. Только session-specific фон; long-term профиль пользователя уже передаётся отдельно.\n${JSON.stringify(
    buildPromptHandoffSummaryPayload(summary)
  )}`;
}

export function serializeHandoffSummaryForRealtimeVoicePrompt(
  summary: SessionHandoffSummary
): string {
  return `Память из предыдущего диалога. Используй её как session-specific фон для voice-разговора, но не цитируй её дословно и не подменяй ей текущие слова пользователя.\n${JSON.stringify(
    buildPromptHandoffSummaryPayload(summary)
  )}`;
}

export function serializeDurableUserMemoryForPrompt(
  memory: DurableUserMemory
): string {
  const prefix = 'Память пользователя:\n';
  const budgetedMemory = fitDurableUserMemoryForPromptBudget(memory, {
    maxChars: DURABLE_MEMORY_PROMPT_BUDGET_MAX_CHARS,
    prefixChars: prefix.length,
  });

  return `${prefix}${JSON.stringify(
    buildPromptDurableUserMemoryPayload(budgetedMemory)
  )}`;
}

export function serializeRuntimeCompactStateForPrompt(
  compactState: RuntimeCompactState
): string {
  return `Runtime compact текущей сессии. Это канонический контекст после reset chain.\n${JSON.stringify(compactState)}`;
}
