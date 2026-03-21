import { randomUUID } from 'node:crypto';
import { config } from '@/server/config';
import {
  CHAT_HANDOFF_SUMMARY_SCHEMA_VERSION,
  CHAT_RUNTIME_COMPACT_SCHEMA_VERSION,
} from '@/server/config/chatMemory';
import {
  createEmptyHandoffSummary,
  createEmptyDurableUserMemory,
  createEmptyRuntimeCompactState,
  hasMeaningfulDurableUserMemory,
  normalizeHandoffSummary,
  normalizeDurableUserMemory,
  runtimeCompactStateSchema,
  serializeDurableUserMemoryForPrompt,
  type DurableUserMemory,
  type RuntimeCompactState,
  type SessionHandoffSummary,
} from './chatMemory.types';
import type { TherapySessionTranscriptMessage } from '@/server/utils/therapySessionTranscriptStore';
import {
  extractResponsesText,
  parseStrictJsonResponse,
  sendOpenAiResponsesRequest,
} from '@/server/infrastructure/llm/openaiResponsesClient';
import {
  logOpenAiRequest,
  logOpenAiUsage,
} from '../../infrastructure/llm/openaiLogging';
import { isRelayEnabled } from '@/server/infrastructure/llm/relayClient';
import { pickDurableUserMemorySource } from './durableUserMemorySource';
import { pickHandoffSummarySource } from './sessionHandoffSummarySource';
import {
  runtimeCompactStateResponseFormat,
  sessionEndMemoryBundleResponseFormat,
  type ResponsesJsonSchemaTextFormat,
} from './chatSummaryResponseFormat';
import {
  serializeTherapySessionTranscriptForAnalysis,
  serializeTherapySessionTranscriptForSessionEndAnalysis,
  type TherapySessionSourceMode,
} from './sessionTranscriptProjection';

type ResponsesInputItem = {
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: Array<{ type: 'input_text' | 'output_text'; text: string }>;
};

const RUNTIME_COMPACT_SYSTEM_PROMPT = `Собери короткий technical compact-state активной therapySession.
Верни только JSON.
Не выдумывай факты.
Не пересказывай весь диалог.
Нужен краткий state для продолжения этой же сессии после reset chain.`;

const SESSION_END_MEMORY_BUNDLE_SYSTEM_PROMPT = `Верни только JSON.

Нужны 2 объекта:
1. handoff — краткая память для следующей сессии
2. profile — итоговая каноническая долговременная память пользователя

Правила:
- previous profile, если передан, канонический.
- profile — это уже финальный merged profile после анализа transcript и previous profile.
- сервер не будет сам делать add/replace/delete за тебя: верни готовый итог.
- если новое явное утверждение противоречит старому, обнови profile по последнему явному утверждению пользователя.
- сохраняй только явные устойчивые данные без дублей и мусора.
- profile должен быть компактным: facts до 3, preferences до 3, context до 2.
- каждый элемент profile — одна короткая строка, обычно до 80 символов.
- handoff должен быть только session-specific и не должен дублировать profile.
- не клади в handoff имя, facts, favorites, preferences или long-term context пользователя.
- handoff нужен только для старта следующей сессии: что обсуждали, какие темы активны, что помогало, что осталось незавершённым, есть ли risk, с чего лучше продолжить.

Классификация:
- name — предпочитаемое имя или ник.
- facts — устойчивые facts и favorites: "любимый цвет: белый", "favorite car: BMW".
- preferences — likes/dislikes/tastes/habits/style: "любит джаз", "не любит созвоны", "предпочитает короткие ответы".
- context — роль, проект, цель, долгий жизненный фон: "работает врачом", "строит приложение", "хочет переехать".

Правила выбора поля:
- like/dislike/prefer/habit -> preferences
- favorite / любимый X -> facts
- role / project / goal / long-term situation -> context
- не перефразируй и не повторяй старые элементы без причины
- при полном bucket приоритет такой: identity/name > явные favorites > долгие устойчивые preferences/context > ситуативные или менее полезные детали`;

function getOpenAiTransportConfig() {
  const useRelay = isRelayEnabled();
  const apiKey = useRelay ? undefined : process.env.NUXT_OPENAI_API_KEY;

  return {
    apiKey,
    org: process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID,
    project:
      process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID,
  };
}

function mapTranscriptToResponsesInput(
  messages: TherapySessionTranscriptMessage[]
): ResponsesInputItem[] {
  return messages.flatMap((message) => {
    const text = String(message.content || '').trim();
    if (!text) {
      return [];
    }

    if (message.role === 'assistant') {
      return [
        {
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        },
      ];
    }

    return [
      {
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    ];
  });
}

function buildSerializedTranscriptInput(params: {
  messages: TherapySessionTranscriptMessage[];
  sourceMode?: TherapySessionSourceMode;
  runtimeCompactCursorMessageId?: number | null;
}): ResponsesInputItem {
  const serializedTranscript =
    params.sourceMode === 'realtime_voice'
      ? serializeTherapySessionTranscriptForSessionEndAnalysis({
          messages: params.messages,
          sourceMode: params.sourceMode,
          runtimeCompactCursorMessageId: params.runtimeCompactCursorMessageId,
        })
      : serializeTherapySessionTranscriptForAnalysis(params.messages);

  return {
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: `Полный transcript сессии для анализа. Учитывай весь transcript, а не только хвост.

<session_transcript>
${serializedTranscript}
</session_transcript>`,
      },
    ],
  };
}

function isMeaningfulStringList(values: string[]): boolean {
  return values.some((value) => value.trim().length > 0);
}

export function hasMeaningfulRuntimeCompactState(
  compactState: RuntimeCompactState | null | undefined
): boolean {
  if (!compactState) {
    return false;
  }

  return (
    compactState.compactOverview.trim().length > 0 ||
    isMeaningfulStringList(compactState.activeThemes) ||
    isMeaningfulStringList(compactState.activePatterns) ||
    isMeaningfulStringList(compactState.helpfulInterventions) ||
    isMeaningfulStringList(compactState.unfinishedThreads) ||
    isMeaningfulStringList(compactState.nextTurnGuidance) ||
    compactState.riskState !== 'none'
  );
}

export function hasMeaningfulHandoffSummary(
  summary: SessionHandoffSummary | null | undefined
): boolean {
  if (!summary) {
    return false;
  }

  return (
    summary.sessionOverviewShort.trim().length > 0 ||
    isMeaningfulStringList(summary.themesActive) ||
    isMeaningfulStringList(summary.patternsOrTriggers) ||
    isMeaningfulStringList(summary.helpfulInterventions) ||
    isMeaningfulStringList(summary.unfinishedThreads) ||
    isMeaningfulStringList(summary.nextSessionGuidance) ||
    summary.riskState !== 'none'
  );
}

async function requestStructuredState<T>(params: {
  model?: string;
  purpose: 'finish_session' | 'other';
  scope: 'session_end_memory_bundle' | 'runtime_compact_state';
  systemPrompt: string;
  developerPrompt?: string;
  transcriptMessages: TherapySessionTranscriptMessage[];
  transcriptMode?: 'conversation_items' | 'serialized_block';
  transcriptSourceMode?: TherapySessionSourceMode;
  runtimeCompactCursorMessageId?: number | null;
  maxOutputTokens?: number;
  fallbackValue: T;
  parse: (raw: unknown) => T;
  responseFormat?: ResponsesJsonSchemaTextFormat;
  throwOnError?: boolean;
}) {
  const { apiKey, org, project } = getOpenAiTransportConfig();
  const usedModel = params.model || config.llm.openai.defaultModel;
  const transcriptInput =
    params.transcriptMode === 'serialized_block'
      ? [
          buildSerializedTranscriptInput({
            messages: params.transcriptMessages,
            sourceMode: params.transcriptSourceMode,
            runtimeCompactCursorMessageId: params.runtimeCompactCursorMessageId,
          }),
        ]
      : mapTranscriptToResponsesInput(params.transcriptMessages);
  const firstTranscriptMessage = params.transcriptMessages[0];
  const sessionId = firstTranscriptMessage?.therapySessionId
    ? String(firstTranscriptMessage.therapySessionId)
    : 'none';
  const userId = firstTranscriptMessage?.userId ?? 'unknown';
  const input: ResponsesInputItem[] = [
    {
      role: 'system',
      content: [{ type: 'input_text', text: params.systemPrompt }],
    },
    ...(params.developerPrompt
      ? [
          {
            role: 'developer' as const,
            content: [
              { type: 'input_text' as const, text: params.developerPrompt },
            ],
          },
        ]
      : []),
    ...transcriptInput,
    {
      role: 'developer',
      content: [
        {
          type: 'input_text',
          text:
            params.transcriptMode === 'serialized_block'
              ? 'Проанализируй весь transcript между тегами <session_transcript> и верни только JSON по заданной schema.'
              : 'Верни только валидный JSON.',
        },
      ],
    },
  ];

  try {
    const requestStartedAtMs = Date.now();
    logOpenAiRequest({
      label: '[OpenAI responses] Отправка structured state запроса:',
      scope: params.scope,
      model: usedModel,
      input,
      userId,
      sessionId,
      extra: {
        purpose: params.purpose,
        transcriptMode: params.transcriptMode || 'conversation_items',
        transcriptSourceMode: params.transcriptSourceMode || 'text',
        transcriptMessagesCount: params.transcriptMessages.length,
        hasDeveloperPrompt: Boolean(params.developerPrompt),
        maxOutputTokens:
          typeof params.maxOutputTokens === 'number'
            ? params.maxOutputTokens
            : null,
        responseFormatName: params.responseFormat?.name || null,
      },
    });
    const response = await sendOpenAiResponsesRequest({
      body: {
        model: usedModel,
        input,
        store: false,
        temperature: 0.1,
        ...(typeof params.maxOutputTokens === 'number'
          ? { max_output_tokens: params.maxOutputTokens }
          : {}),
        text: params.responseFormat
          ? {
              format: params.responseFormat,
            }
          : {},
      },
      purpose: params.purpose,
      timeoutMs: 30_000,
      apiKey,
      org,
      project,
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
    });
    const rawText = extractResponsesText(response);
    logOpenAiUsage({
      scope: params.scope,
      model: usedModel,
      input,
      usageSource: response,
      latencyMs: Date.now() - requestStartedAtMs,
      outputTextChars: rawText.length,
      userId,
      sessionId,
      extra: {
        purpose: params.purpose,
        transcriptMode: params.transcriptMode || 'conversation_items',
        transcriptSourceMode: params.transcriptSourceMode || 'text',
        transcriptMessagesCount: params.transcriptMessages.length,
        responseFormatName: params.responseFormat?.name || null,
      },
    });
    const parsedJson = parseStrictJsonResponse(rawText);
    return params.parse(parsedJson);
  } catch (error) {
    console.error('[chatSummary] Structured state generation failed:', error);
    if (params.throwOnError) {
      throw error;
    }
    return params.fallbackValue;
  }
}

export async function generateRuntimeCompactState(params: {
  model?: string;
  existingCompactState?: RuntimeCompactState | null;
  transcriptMessages: TherapySessionTranscriptMessage[];
  throwOnError?: boolean;
}): Promise<RuntimeCompactState> {
  const developerPrompt = params.existingCompactState
    ? `Текущий канонический compact-state сессии:\n${JSON.stringify(params.existingCompactState)}`
    : undefined;

  return await requestStructuredState<RuntimeCompactState>({
    model: params.model,
    purpose: 'other',
    scope: 'runtime_compact_state',
    systemPrompt: RUNTIME_COMPACT_SYSTEM_PROMPT,
    developerPrompt,
    transcriptMessages: params.transcriptMessages,
    responseFormat: runtimeCompactStateResponseFormat,
    maxOutputTokens: 350,
    fallbackValue: createEmptyRuntimeCompactState(),
    throwOnError: params.throwOnError,
    parse: (raw) =>
      runtimeCompactStateSchema.parse({
        ...createEmptyRuntimeCompactState(),
        ...raw,
        schemaVersion: CHAT_RUNTIME_COMPACT_SCHEMA_VERSION,
      }),
  });
}

export async function generateSessionEndMemoryBundle(params: {
  model?: string;
  runtimeCompactState?: RuntimeCompactState | null;
  previousDurableUserMemory?: DurableUserMemory | null;
  transcriptMessages: TherapySessionTranscriptMessage[];
  sessionSourceMode?: TherapySessionSourceMode;
  runtimeCompactCursorMessageId?: number | null;
  throwOnError?: boolean;
}): Promise<{
  handoffSummary: SessionHandoffSummary;
  durableUserMemory: DurableUserMemory;
}> {
  const developerBlocks: string[] = [];

  if (params.runtimeCompactState) {
    developerBlocks.push(
      `Текущий канонический compact-state завершённой сессии:\n${JSON.stringify(params.runtimeCompactState)}`
    );
  }

  if (hasMeaningfulDurableUserMemory(params.previousDurableUserMemory)) {
    developerBlocks.push(
      serializeDurableUserMemoryForPrompt(params.previousDurableUserMemory)
    );
  }

  return await requestStructuredState<{
    handoffSummary: SessionHandoffSummary;
    durableUserMemory: DurableUserMemory;
  }>({
    model: params.model,
    purpose: 'finish_session',
    scope: 'session_end_memory_bundle',
    systemPrompt: SESSION_END_MEMORY_BUNDLE_SYSTEM_PROMPT,
    developerPrompt:
      developerBlocks.length > 0
        ? [
            'Ниже канонический previous profile.',
            'Верни уже готовый merged profile, а не patch.',
            'Сервер сохранит ровно тот profile, который ты вернёшь.',
            ...developerBlocks,
          ].join('\n\n')
        : undefined,
    transcriptMessages: params.transcriptMessages,
    transcriptMode: 'serialized_block',
    transcriptSourceMode: params.sessionSourceMode,
    runtimeCompactCursorMessageId: params.runtimeCompactCursorMessageId,
    responseFormat: sessionEndMemoryBundleResponseFormat,
    fallbackValue: {
      handoffSummary: createEmptyHandoffSummary(),
      durableUserMemory: params.previousDurableUserMemory
        ? normalizeDurableUserMemory(params.previousDurableUserMemory)
        : createEmptyDurableUserMemory(),
    },
    throwOnError: params.throwOnError,
    parse: (raw) => {
      const record =
        raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const handoffRawSource = pickHandoffSummarySource(record);
      const handoffRaw =
        handoffRawSource && typeof handoffRawSource === 'object'
          ? (handoffRawSource as Record<string, unknown>)
          : {};
      const profileRaw = pickDurableUserMemorySource(record);

      return {
        handoffSummary: normalizeHandoffSummary({
          ...createEmptyHandoffSummary(),
          ...handoffRaw,
          schemaVersion: CHAT_HANDOFF_SUMMARY_SCHEMA_VERSION,
        }),
        durableUserMemory: normalizeDurableUserMemory(profileRaw),
      };
    },
  });
}
