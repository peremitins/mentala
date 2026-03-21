import { db } from '@/server/infrastructure/db/client';
import { realtimeVoiceSessions } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import {
  CHAT_HANDOFF_SUMMARY_SCHEMA_VERSION,
  CHAT_MEMORY_MAX_INPUT_TOKENS,
  CHAT_MEMORY_MAX_TURNS_PER_CHAIN,
  CHAT_MEMORY_SOFT_INPUT_TOKENS,
  CHAT_RUNTIME_COMPACT_SCHEMA_VERSION,
} from '@/server/config/chatMemory';
import { config } from '@/server/config';
import { chatSessionMemoryStore } from '@/server/utils/chatSessionMemoryStore';
import { therapySessionTranscriptStore } from '@/server/utils/therapySessionTranscriptStore';
import { summaryStore } from '@/server/utils/summaryStore';
import {
  createEmptyHandoffSummary,
  createEmptyRuntimeCompactState,
  type DurableUserMemory,
  DURABLE_USER_MEMORY_SCHEMA_VERSION,
  hasMeaningfulDurableUserMemory,
  normalizeDurableUserMemory,
  normalizeHandoffSummary,
  serializeHandoffSummaryForPrompt,
  serializeDurableUserMemoryForPrompt,
  serializeRuntimeCompactStateForPrompt,
  type RuntimeCompactState,
  type SessionHandoffSummary,
} from './chatMemory.types';
import {
  generateRuntimeCompactState,
  generateSessionEndMemoryBundle,
  hasMeaningfulHandoffSummary,
  hasMeaningfulRuntimeCompactState,
} from './chatSummary.service';
import { readChatSettings } from '@/server/utils/storage';
import { enqueueChatSessionSummaryJob } from './queues/chatSessionSummary.queue';
import { extractOpenAiUsageSnapshot } from '@/server/utils/openaiUsage';
import { durableUserMemoryStore } from '@/server/utils/durableUserMemoryStore';
import { resolveSessionSummaryTranscriptStrategy } from './sessionSummaryTranscriptPolicy';
import {
  projectTherapySessionTranscriptFromHistory,
  type TherapySessionSourceMode,
} from './sessionTranscriptProjection';

export type CompactionReason =
  | 'soft_threshold'
  | 'hard_threshold'
  | 'max_turns'
  | null;

export type ChatMemoryContext = {
  previousResponseId: string | null;
  shouldSendBootstrap: boolean;
  isFirstSession: boolean;
  durableUserMemory: DurableUserMemory | null;
  handoffSummary: SessionHandoffSummary | null;
  runtimeCompactState: RuntimeCompactState | null;
  compactionReason: CompactionReason;
  estimatedNextInputTokens: number;
};

async function resolveTherapySessionSourceMode(
  therapySessionId: number
): Promise<TherapySessionSourceMode> {
  const rows = await db
    .select({ id: realtimeVoiceSessions.id })
    .from(realtimeVoiceSessions)
    .where(eq(realtimeVoiceSessions.therapySessionId, therapySessionId))
    .limit(1);

  return rows[0] ? 'realtime_voice' : 'text';
}

export function estimateTokensByChars(text: string): number {
  return Math.ceil(String(text || '').length / 4);
}

export function estimateTokensByTexts(texts: string[]): number {
  return texts.reduce((sum, text) => sum + estimateTokensByChars(text), 0);
}

async function loadTherapySessionSummarySourceState(params: {
  therapySessionId: number;
}) {
  const state = await chatSessionMemoryStore.get<RuntimeCompactState>(
    params.therapySessionId
  );
  const runtimeCompactState =
    state?.runtimeCompactSchemaVersion ===
      CHAT_RUNTIME_COMPACT_SCHEMA_VERSION &&
    state?.runtimeCompactState &&
    hasMeaningfulRuntimeCompactState(state.runtimeCompactState)
      ? state.runtimeCompactState
      : null;
  const transcriptStrategy = resolveSessionSummaryTranscriptStrategy({
    hasRuntimeCompactState: Boolean(runtimeCompactState),
    runtimeCompactCursorMessageId: state?.runtimeCompactCursorMessageId,
  });
  const transcriptMessages =
    transcriptStrategy === 'after_cursor' &&
    typeof state?.runtimeCompactCursorMessageId === 'number'
      ? await therapySessionTranscriptStore.getMessagesAfter({
          therapySessionId: params.therapySessionId,
          afterMessageId: state.runtimeCompactCursorMessageId,
        })
      : await therapySessionTranscriptStore.getMessages(
          params.therapySessionId
        );

  const sessionSourceMode = await resolveTherapySessionSourceMode(
    params.therapySessionId
  );

  return {
    state,
    runtimeCompactState,
    sessionSourceMode,
    transcriptMessages,
  };
}

export async function getLatestMeaningfulHandoffSummaryForUser(
  userId: number,
  options?: {
    excludeTherapySessionId?: number | null;
  }
): Promise<SessionHandoffSummary | null> {
  const latest =
    await summaryStore.getLatestHandoffSummary<SessionHandoffSummary>(userId);

  if (!latest) {
    return null;
  }

  if (latest.schemaVersion !== CHAT_HANDOFF_SUMMARY_SCHEMA_VERSION) {
    return null;
  }

  if (
    typeof options?.excludeTherapySessionId === 'number' &&
    latest.therapySessionId === options.excludeTherapySessionId
  ) {
    return null;
  }

  const normalizedSummary = normalizeHandoffSummary(latest.summary);

  return hasMeaningfulHandoffSummary(normalizedSummary)
    ? normalizedSummary
    : null;
}

export async function getMeaningfulDurableUserMemoryForUser(
  userId: number
): Promise<DurableUserMemory | null> {
  const latest =
    await durableUserMemoryStore.getByUserId<DurableUserMemory>(userId);

  if (!latest) {
    return null;
  }

  if (latest.schemaVersion !== DURABLE_USER_MEMORY_SCHEMA_VERSION) {
    return null;
  }

  const normalizedMemory = normalizeDurableUserMemory(latest.memory);

  return hasMeaningfulDurableUserMemory(normalizedMemory)
    ? normalizedMemory
    : null;
}

export async function hasAnyMeaningfulChatMemoryForUser(
  userId: number
): Promise<boolean> {
  const [handoffSummary, durableUserMemory] = await Promise.all([
    getLatestMeaningfulHandoffSummaryForUser(userId),
    getMeaningfulDurableUserMemoryForUser(userId),
  ]);

  return Boolean(handoffSummary || durableUserMemory);
}

function resolveCompactionReason(params: {
  hasPreviousResponseId: boolean;
  lastObservedInputTokens: number | null;
  estimatedNextInputTokens: number;
  chainTurnCount: number;
  pendingSoftCompaction: boolean;
  isSafeUserTurn: boolean;
}): CompactionReason {
  if (!params.hasPreviousResponseId) {
    return null;
  }

  if (
    (params.lastObservedInputTokens ?? 0) >= CHAT_MEMORY_MAX_INPUT_TOKENS ||
    params.estimatedNextInputTokens > CHAT_MEMORY_MAX_INPUT_TOKENS
  ) {
    return 'hard_threshold';
  }

  if (params.chainTurnCount >= CHAT_MEMORY_MAX_TURNS_PER_CHAIN) {
    return 'max_turns';
  }

  if (params.pendingSoftCompaction && params.isSafeUserTurn) {
    return 'soft_threshold';
  }

  return null;
}

export async function resolveChatMemoryContext(params: {
  userId: number;
  therapySessionId: number;
  model?: string;
  enableMemory: boolean;
  estimatedBootstrapTokens: number;
  estimatedPerTurnTokens: number;
  isSafeUserTurn: boolean;
}): Promise<ChatMemoryContext> {
  if (!params.enableMemory) {
    return {
      previousResponseId: null,
      shouldSendBootstrap: true,
      isFirstSession: true,
      durableUserMemory: null,
      handoffSummary: null,
      runtimeCompactState: null,
      compactionReason: null,
      estimatedNextInputTokens:
        params.estimatedBootstrapTokens + params.estimatedPerTurnTokens,
    };
  }

  await chatSessionMemoryStore.ensureSession({
    therapySessionId: params.therapySessionId,
    userId: params.userId,
  });

  let state = await chatSessionMemoryStore.get<RuntimeCompactState>(
    params.therapySessionId
  );
  const hasValidPreviousResponseId =
    Boolean(state?.previousResponseId) &&
    chatSessionMemoryStore.isResponseIdValid(state?.previousResponseExpiresAt);
  const estimatedNextInputTokens = hasValidPreviousResponseId
    ? (state?.lastObservedInputTokens ?? 0) + params.estimatedPerTurnTokens
    : params.estimatedBootstrapTokens + params.estimatedPerTurnTokens;

  const compactionReason = resolveCompactionReason({
    hasPreviousResponseId: hasValidPreviousResponseId,
    lastObservedInputTokens: state?.lastObservedInputTokens ?? null,
    estimatedNextInputTokens,
    chainTurnCount: state?.chainTurnCount ?? 0,
    pendingSoftCompaction: state?.pendingSoftCompaction ?? false,
    isSafeUserTurn: params.isSafeUserTurn,
  });

  if (compactionReason) {
    await performRuntimeCompaction({
      therapySessionId: params.therapySessionId,
      userId: params.userId,
      model: params.model,
      reason: compactionReason,
    });
    state = await chatSessionMemoryStore.get<RuntimeCompactState>(
      params.therapySessionId
    );
  }

  const runtimeCompactState =
    state?.runtimeCompactSchemaVersion ===
      CHAT_RUNTIME_COMPACT_SCHEMA_VERSION &&
    state?.runtimeCompactState &&
    hasMeaningfulRuntimeCompactState(state.runtimeCompactState)
      ? state.runtimeCompactState
      : null;

  const previousResponseId =
    state?.previousResponseId &&
    chatSessionMemoryStore.isResponseIdValid(state.previousResponseExpiresAt)
      ? state.previousResponseId
      : null;

  // Межсессионную память подмешиваем только в bootstrap новой chain.
  // После runtime compaction внутри той же сессии достаточно compact-state,
  // иначе мы платим повторно за те же durable blocks.
  const shouldUseCrossSessionBootstrap =
    !previousResponseId && !runtimeCompactState;

  const durableUserMemory = shouldUseCrossSessionBootstrap
    ? await getMeaningfulDurableUserMemoryForUser(params.userId)
    : null;

  let handoffSummary: SessionHandoffSummary | null = null;
  if (shouldUseCrossSessionBootstrap) {
    handoffSummary = await getLatestMeaningfulHandoffSummaryForUser(
      params.userId,
      {
        excludeTherapySessionId: params.therapySessionId,
      }
    );
  }

  const isFirstSession =
    !previousResponseId &&
    !runtimeCompactState &&
    !handoffSummary &&
    !durableUserMemory;

  return {
    previousResponseId,
    shouldSendBootstrap: !previousResponseId,
    isFirstSession,
    durableUserMemory,
    handoffSummary,
    runtimeCompactState,
    compactionReason,
    estimatedNextInputTokens,
  };
}

export async function performRuntimeCompaction(params: {
  therapySessionId: number;
  userId: number;
  model?: string;
  reason: Exclude<CompactionReason, null>;
}): Promise<RuntimeCompactState> {
  const state = await chatSessionMemoryStore.get<RuntimeCompactState>(
    params.therapySessionId
  );
  const existingCompactState =
    state?.runtimeCompactSchemaVersion ===
      CHAT_RUNTIME_COMPACT_SCHEMA_VERSION &&
    state?.runtimeCompactState &&
    hasMeaningfulRuntimeCompactState(state.runtimeCompactState)
      ? state.runtimeCompactState
      : null;
  const transcriptMessages =
    existingCompactState && state?.runtimeCompactCursorMessageId
      ? await therapySessionTranscriptStore.getMessagesAfter({
          therapySessionId: params.therapySessionId,
          afterMessageId: state.runtimeCompactCursorMessageId,
        })
      : await therapySessionTranscriptStore.getMessages(
          params.therapySessionId
        );

  const compactState =
    transcriptMessages.length || existingCompactState
      ? await generateRuntimeCompactState({
          model: params.model,
          existingCompactState,
          transcriptMessages,
        })
      : createEmptyRuntimeCompactState();

  if (
    (transcriptMessages.length > 0 || existingCompactState) &&
    !hasMeaningfulRuntimeCompactState(compactState)
  ) {
    console.warn(
      '[ChatMemory] Runtime compaction produced empty state, skip reset chain',
      {
        therapySessionId: params.therapySessionId,
        userId: params.userId,
        reason: params.reason,
        transcriptMessagesCount: transcriptMessages.length,
        hadExistingCompactState: Boolean(existingCompactState),
      }
    );

    return existingCompactState ?? createEmptyRuntimeCompactState();
  }

  const lastMessageId = await therapySessionTranscriptStore.getLastMessageId(
    params.therapySessionId
  );

  await chatSessionMemoryStore.saveRuntimeCompactState({
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    compactState,
    schemaVersion: compactState.schemaVersion,
    cursorMessageId: lastMessageId,
  });

  console.info('[ChatMemory] Runtime compaction completed', {
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    reason: params.reason,
    lastMessageId,
  });

  return compactState;
}

export async function recordSuccessfulChatTurn(params: {
  userId: number;
  therapySessionId: number;
  turnIndex: number;
  enableMemory: boolean;
  conversationMessages?: Array<{
    role: 'system' | 'developer' | 'user' | 'assistant';
    content: string;
  }>;
  userMessage: string;
  assistantMessage: string;
  responseId: string | null;
  usageSource: unknown;
}) {
  if (!params.enableMemory) {
    return;
  }

  const trimmedUserMessage = String(params.userMessage || '').trim();
  const trimmedAssistantMessage = String(params.assistantMessage || '').trim();
  if (!trimmedUserMessage || !trimmedAssistantMessage) {
    return;
  }

  const projectedTranscript = projectTherapySessionTranscriptFromHistory({
    historyMessages: params.conversationMessages,
    fallbackUserMessage: trimmedUserMessage,
    assistantMessage: trimmedAssistantMessage,
  });

  if (projectedTranscript.length) {
    // Храним в transient transcript всю текущую историю сессии, а не только последний pair.
    // Это позволяет session-end summary и durable memory видеть полный разговор даже после
    // server reload/dev-перезапуска и не терять ранние факты пользователя.
    await therapySessionTranscriptStore.replaceMessages({
      therapySessionId: params.therapySessionId,
      userId: params.userId,
      messages: projectedTranscript,
    });
  } else {
    await therapySessionTranscriptStore.appendMessage({
      therapySessionId: params.therapySessionId,
      userId: params.userId,
      turnIndex: params.turnIndex,
      role: 'user',
      content: trimmedUserMessage,
    });
    await therapySessionTranscriptStore.appendMessage({
      therapySessionId: params.therapySessionId,
      userId: params.userId,
      turnIndex: params.turnIndex,
      role: 'assistant',
      content: trimmedAssistantMessage,
    });
  }

  const usage = extractOpenAiUsageSnapshot(params.usageSource);
  const inputTokens = usage?.inputTokens ?? null;
  const outputTokens = usage?.outputTokens ?? null;
  const totalTokens = usage?.totalTokens ?? null;
  const pendingSoftCompaction =
    typeof inputTokens === 'number' &&
    inputTokens >= CHAT_MEMORY_SOFT_INPUT_TOKENS &&
    inputTokens < CHAT_MEMORY_MAX_INPUT_TOKENS;

  await chatSessionMemoryStore.recordSuccessfulTurn({
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    inputTokens,
    outputTokens,
    totalTokens,
    pendingSoftCompaction,
  });

  if (params.responseId) {
    await chatSessionMemoryStore.saveResponseId({
      therapySessionId: params.therapySessionId,
      userId: params.userId,
      responseId: params.responseId,
    });
  }
}

export function buildSessionMemoryPromptBlocks(context: {
  durableUserMemory: DurableUserMemory | null;
  handoffSummary: SessionHandoffSummary | null;
  runtimeCompactState: RuntimeCompactState | null;
}): string[] {
  const blocks: string[] = [];

  if (context.durableUserMemory) {
    blocks.push(serializeDurableUserMemoryForPrompt(context.durableUserMemory));
  }

  if (context.handoffSummary) {
    blocks.push(serializeHandoffSummaryForPrompt(context.handoffSummary));
  }

  if (context.runtimeCompactState) {
    blocks.push(
      serializeRuntimeCompactStateForPrompt(context.runtimeCompactState)
    );
  }

  return blocks;
}

export async function handleTherapySessionEnded(params: {
  therapySessionId: number;
  userId: number;
  model?: string;
}) {
  const chatSettings = await readChatSettings(String(params.userId));
  const enableMemory = chatSettings.enablePreviousResponseId ?? true;

  await chatSessionMemoryStore.clearResponseId(params.therapySessionId);

  if (!enableMemory) {
    await cleanupTherapySessionMemory(params.therapySessionId);
    return;
  }

  try {
    await enqueueChatSessionSummaryJob({
      therapySessionId: params.therapySessionId,
      userId: params.userId,
      model: params.model,
    });
  } catch (error) {
    console.error(
      '[ChatMemory] Failed to enqueue session summary job, using inline fallback:',
      {
        therapySessionId: params.therapySessionId,
        userId: params.userId,
        error,
      }
    );

    try {
      // Если очередь недоступна, всё равно строим summary/fallback inline,
      // чтобы не потерять межсессионный handoff и не оставить transient state висеть.
      await processSessionSummaryJob({
        therapySessionId: params.therapySessionId,
        userId: params.userId,
        model: params.model,
        saveFallbackEmptySummary: true,
        throwOnError: false,
      });
    } catch (inlineError) {
      console.error(
        '[ChatMemory] Inline session summary fallback failed, cleaning transient state:',
        {
          therapySessionId: params.therapySessionId,
          userId: params.userId,
          error: inlineError,
        }
      );
      await cleanupTransientTherapySessionMemory(params.therapySessionId);
    }
  }
}

export async function cleanupTransientTherapySessionMemory(
  therapySessionId: number
) {
  await Promise.all([
    therapySessionTranscriptStore.deleteByTherapySessionId(therapySessionId),
    chatSessionMemoryStore.clearSession(therapySessionId),
  ]);
}

export async function cleanupTherapySessionMemory(therapySessionId: number) {
  await Promise.all([
    cleanupTransientTherapySessionMemory(therapySessionId),
    summaryStore.deleteByTherapySessionId(therapySessionId),
  ]);
}

export async function clearAllChatMemoryForUser(userId: number) {
  await Promise.all([
    therapySessionTranscriptStore.deleteByUserId(userId),
    chatSessionMemoryStore.clearAllForUser(userId),
    summaryStore.deleteByUserId(userId),
    durableUserMemoryStore.deleteByUserId(userId),
  ]);
}

export async function buildAndPersistHandoffSummaryForTherapySession(params: {
  therapySessionId: number;
  userId: number;
  model?: string;
  saveFallbackEmptySummary?: boolean;
  throwOnError?: boolean;
  cleanupTransientMemory?: boolean;
}) {
  const existingSummary =
    await summaryStore.getHandoffSummaryByTherapySessionId<SessionHandoffSummary>(
      params.therapySessionId
    );

  if (existingSummary) {
    const normalizedExistingSummary = normalizeHandoffSummary(
      existingSummary.summary
    );

    if (params.cleanupTransientMemory !== false) {
      await cleanupTransientTherapySessionMemory(params.therapySessionId);
    }

    return {
      summaryCreated: hasMeaningfulHandoffSummary(normalizedExistingSummary),
      summary: normalizedExistingSummary,
      deduplicated: true,
      hasAnyUserContext: true,
    };
  }

  const { runtimeCompactState, sessionSourceMode, state, transcriptMessages } =
    await loadTherapySessionSummarySourceState({
      therapySessionId: params.therapySessionId,
    });
  const existingDurableUserMemory = await getMeaningfulDurableUserMemoryForUser(
    params.userId
  );

  const hasAnyUserContext =
    transcriptMessages.some((message) => message.role === 'user') ||
    Boolean(runtimeCompactState);

  if (!hasAnyUserContext) {
    if (params.cleanupTransientMemory !== false) {
      await cleanupTransientTherapySessionMemory(params.therapySessionId);
    }

    return {
      summaryCreated: false,
      summary: null,
      deduplicated: false,
      hasAnyUserContext: false,
    };
  }

  const bundle = await generateSessionEndMemoryBundle({
    model: params.model,
    runtimeCompactState,
    previousDurableUserMemory: existingDurableUserMemory,
    transcriptMessages,
    sessionSourceMode,
    runtimeCompactCursorMessageId: state?.runtimeCompactCursorMessageId,
    throwOnError: params.throwOnError,
  });
  const summary = bundle.handoffSummary;
  const meaningfulSummary = hasMeaningfulHandoffSummary(summary)
    ? summary
    : createEmptyHandoffSummary();
  const durableUserMemory = bundle.durableUserMemory;
  const shouldPersistDurableUserMemory =
    hasMeaningfulDurableUserMemory(durableUserMemory);

  if (shouldPersistDurableUserMemory) {
    await durableUserMemoryStore.save({
      userId: params.userId,
      memory: durableUserMemory,
      schemaVersion: durableUserMemory.schemaVersion,
    });
  }

  await summaryStore.saveHandoffSummary({
    userId: params.userId,
    therapySessionId: params.therapySessionId,
    model: params.model || config.llm.openai.defaultModel,
    summary: meaningfulSummary,
  });

  if (params.cleanupTransientMemory !== false) {
    await cleanupTransientTherapySessionMemory(params.therapySessionId);
  }

  return {
    summaryCreated: hasMeaningfulHandoffSummary(summary),
    summary: meaningfulSummary,
    deduplicated: false,
    hasAnyUserContext: true,
  };
}

export async function processSessionSummaryJob(params: {
  therapySessionId: number;
  userId: number;
  model?: string;
  saveFallbackEmptySummary?: boolean;
  throwOnError?: boolean;
}) {
  const chatSettings = await readChatSettings(String(params.userId));
  const enableMemory = chatSettings.enablePreviousResponseId ?? true;

  if (!enableMemory) {
    await cleanupTherapySessionMemory(params.therapySessionId);
    return;
  }

  await buildAndPersistHandoffSummaryForTherapySession({
    therapySessionId: params.therapySessionId,
    userId: params.userId,
    model: params.model,
    saveFallbackEmptySummary: params.saveFallbackEmptySummary,
    throwOnError: params.throwOnError,
    cleanupTransientMemory: true,
  });
}

export async function appendTranscriptMessages(
  params: {
    therapySessionId: number;
    userId: number;
    turnIndex: number;
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      tokenCount?: number | null;
    }>;
  },
  tx?: any
) {
  const normalizedMessages = params.messages
    .map((message) => ({
      ...message,
      content: String(message.content || '').trim(),
    }))
    .filter((message) => message.content.length > 0);

  if (!normalizedMessages.length) {
    return;
  }

  for (const message of normalizedMessages) {
    await therapySessionTranscriptStore.appendMessage(
      {
        therapySessionId: params.therapySessionId,
        userId: params.userId,
        turnIndex: params.turnIndex,
        role: message.role,
        content: message.content,
        tokenCount: message.tokenCount ?? null,
      },
      tx
    );
  }
}

export async function isChatMemoryEnabledForUser(userId: number) {
  const chatSettings = await readChatSettings(String(userId));
  return chatSettings.enablePreviousResponseId ?? true;
}
