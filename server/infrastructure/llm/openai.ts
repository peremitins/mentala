// server/infrastructure/llm/openai.ts

import { randomUUID, createHash } from 'node:crypto';
import { $fetch } from 'ofetch';
import { createError } from 'h3';
import OpenAI from 'openai';
import type { LlmProviderPort } from '../../ports';
import { config } from '../../config';
import {
  isRelayEnabled,
  relayResponsesRequest,
  relayResponsesStream,
} from './relayClient';
import { summaryStore } from '../../utils/summaryStore';
import { responseIdStore } from '../../utils/responseIdStore';
import { readChatSettings } from '../../utils/storage';
import { welcomePromptStore } from '../../utils/welcomePromptStore';
import {
  getDailyGreetingName,
  pickAlternativeOpening,
  reserveDailyGreeting,
  resolveUserTimezone,
} from '@/server/application/chat/name-greeting.service';
import { isPhobiasEntryContext } from '@/server/application/chat/phobias-entry.service';
import {
  buildSummaryPrompt,
  buildDeveloperContext,
  buildSessionMemoryText,
  buildChatPreludeWithMemory,
  buildWelcomePrompt,
  buildEntryContextDescription,
} from '@@/server/application/prompts';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MIN_SUMMARY_USER_MESSAGES = 1;
const MIN_SUMMARY_USER_CHARS = 20;
// Summary-память полностью отключена в продукте:
// - экономим токены (не передаём лишний контекст в OpenAI),
// - оставляем только manual-память через previous_response_id.
// Код summary сохраняем для возможного возвращения в будущем, но НЕ используем сейчас.
const SUMMARY_ENABLED = false;

// Временно отключаем отправку запросов в OpenAI (чат и уведомления).
const OPENAI_REQUESTS_DISABLED = false;

// In-memory cache for current session encrypted reasoning
const sessionCache = new Map<
  string,
  { encryptedReasoning?: string | null; lastUsedModel?: string }
>();

// В проде никогда не логируем промпты. В dev всегда показываем полный текст.
const ALLOW_PROMPT_LOGS = process.env.NODE_ENV === 'development';

type RelayPurpose =
  | 'chat'
  | 'chat_stream'
  | 'chips'
  | 'finish_session'
  | 'notification'
  | 'other';

function ensureOpenAiEnabled(context: string) {
  if (!OPENAI_REQUESTS_DISABLED) return;
  throw createError({
    statusCode: 503,
    message: `OpenAI временно отключен (${context})`,
  });
}

// Создаем SDK-клиент с org/project, чтобы стрим учитывал настройки организации и проекта.
function createOpenAiClient(apiKey: string) {
  ensureOpenAiEnabled('sdk_client');
  const organization =
    process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID;
  const project =
    process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID;

  return new OpenAI({ apiKey, organization, project });
}

function resolveRelayPurpose(
  options?: { scenario?: 'chat' | 'notifications' | 'chips' },
  isStream?: boolean
): RelayPurpose {
  if (isStream) return 'chat_stream';
  if (options?.scenario === 'chips') return 'chips';
  if (options?.scenario === 'notifications') return 'notification';
  return 'chat';
}

async function sendResponsesRequest(params: {
  body: any;
  purpose: RelayPurpose;
  timeoutMs?: number;
  apiKey?: string;
  org?: string | null;
  project?: string | null;
  idempotencyKey?: string;
  requestId?: string;
}) {
  ensureOpenAiEnabled('responses_request');
  if (isRelayEnabled()) {
    return await relayResponsesRequest({
      path: '/v1/responses',
      body: params.body,
      purpose: params.purpose,
      timeoutMs: params.timeoutMs,
      requestId: params.requestId,
    });
  }

  if (!params.apiKey) {
    throw createError({
      statusCode: 500,
      message: 'NUXT_OPENAI_API_KEY is not set',
    });
  }

  return await $fetch(OPENAI_URL, {
    method: 'POST',
    timeout: params.timeoutMs,
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      ...(params.org ? { 'OpenAI-Organization': params.org } : {}),
      ...(params.project ? { 'OpenAI-Project': params.project } : {}),
      ...(params.idempotencyKey
        ? { 'Idempotency-Key': params.idempotencyKey }
        : {}),
    },
    body: params.body,
  });
}

function extractText(res: any): string {
  return res?.output_text || res?.output?.[0]?.content?.[0]?.text || '';
}

// remove ```json fences and parse
function parseStrictJson(raw: string): any {
  const s = String(raw || '').trim();
  const fenced = s.match(/```json\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : s).trim();
  try {
    return JSON.parse(body);
  } catch {
    return { summary_text: s };
  }
}

// === Валидация и нормализация summary ===
function validateAndNormalizeSummary(parsed: any): any {
  // Базовые проверки
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return createEmptySummary();
  }

  // Список допустимых ключей
  const validKeys = [
    'summary_detailed',
    'themes_explored',
    'patterns_identified',
    'homework_suggested',
    'emotional_journey',
    'topics',
    'risk_flag',
    'approaches_used',
  ];

  // Если есть неправильные ключи - возвращаем пустой summary
  const hasInvalidKeys = Object.keys(parsed).some(
    (key) => !validKeys.includes(key)
  );
  if (hasInvalidKeys) {
    console.warn(
      '[OpenAI finishSession] Invalid summary: unexpected keys found, using empty summary'
    );
    return createEmptySummary();
  }

  // Нормализуем структуру, заполняя недостающие поля
  return {
    summary_detailed:
      typeof parsed.summary_detailed === 'string'
        ? parsed.summary_detailed
        : '',
    themes_explored: Array.isArray(parsed.themes_explored)
      ? parsed.themes_explored.map((theme: any) => ({
          theme:
            typeof theme?.theme === 'string'
              ? theme.theme
              : String(theme || ''),
          depth:
            theme?.depth === 'surface' ||
            theme?.depth === 'moderate' ||
            theme?.depth === 'deep'
              ? theme.depth
              : 'surface',
          key_insight:
            typeof theme?.key_insight === 'string' ? theme.key_insight : '',
        }))
      : [],
    patterns_identified: Array.isArray(parsed.patterns_identified)
      ? parsed.patterns_identified
          .filter((p: any) => typeof p === 'string')
          .slice(0, 10)
      : [],
    homework_suggested:
      parsed.homework_suggested &&
      typeof parsed.homework_suggested === 'object' &&
      !Array.isArray(parsed.homework_suggested)
        ? {
            name:
              typeof parsed.homework_suggested.name === 'string'
                ? parsed.homework_suggested.name
                : '',
            instruction:
              typeof parsed.homework_suggested.instruction === 'string'
                ? parsed.homework_suggested.instruction
                : '',
            duration:
              typeof parsed.homework_suggested.duration === 'string'
                ? parsed.homework_suggested.duration
                : '',
          }
        : null,
    emotional_journey:
      parsed.emotional_journey &&
      typeof parsed.emotional_journey === 'object' &&
      !Array.isArray(parsed.emotional_journey)
        ? {
            start_level:
              typeof parsed.emotional_journey.start_level === 'string'
                ? parsed.emotional_journey.start_level
                : '5',
            end_level:
              typeof parsed.emotional_journey.end_level === 'string'
                ? parsed.emotional_journey.end_level
                : '5',
            shift_observed:
              typeof parsed.emotional_journey.shift_observed === 'string'
                ? parsed.emotional_journey.shift_observed
                : '',
          }
        : null,
    topics: Array.isArray(parsed.topics)
      ? parsed.topics.filter((t: any) => typeof t === 'string').slice(0, 20)
      : [],
    risk_flag:
      parsed.risk_flag === 'none' ||
      parsed.risk_flag === 'watch' ||
      parsed.risk_flag === 'elevated'
        ? parsed.risk_flag
        : 'none',
    approaches_used: Array.isArray(parsed.approaches_used)
      ? parsed.approaches_used
          .filter((a: any) =>
            ['cbt', 'psychoanalysis', 'existential', 'positive'].includes(a)
          )
          .slice(0, 4)
      : [],
  };
}

function createEmptySummary(): any {
  return {
    summary_detailed: '',
    themes_explored: [],
    patterns_identified: [],
    homework_suggested: null,
    emotional_journey: null,
    topics: [],
    risk_flag: 'none',
    approaches_used: [],
  };
}

// === Маппер сообщений под Responses API ===
function mapToResponsesInput(
  messages: Array<{ role: string; content: string }>
) {
  const allowedForInput = new Set(['user', 'system', 'developer']);
  return (messages || []).flatMap((m): Record<string, any>[] => {
    const text = String(m.content ?? '');
    if (!text) return [];

    // assistant → output_text (ВАЖНО!)
    if (m.role === 'assistant') {
      return [
        {
          role: 'assistant',
          content: [{ type: 'output_text' as const, text }],
        },
      ];
    }

    // system / developer / user → input_text
    if (allowedForInput.has(m.role)) {
      return [
        {
          role: m.role as 'system' | 'developer' | 'user',
          content: [{ type: 'input_text' as const, text }],
        },
      ];
    }

    // tool/прочие роли тут не обрабатываем (при необходимости добавить поддержку)
    return [];
  });
}

// === Функция для форматирования промптов для логирования ===
function formatPromptsForLogging(input: any[]): any[] {
  return input.map((item, index) => {
    const role = item.role;
    const content = item.content || [];
    // Извлекаем текст из content, который может быть массивом объектов с type и text
    const textContent = content
      .map((c: any) => {
        // content может быть в формате { type: 'input_text' | 'output_text', text: string }
        if (c.text !== undefined) return c.text;
        // Или в других форматах
        return '';
      })
      .join('')
      .trim();

    const textHash = !ALLOW_PROMPT_LOGS
      ? createHash('sha256').update(textContent).digest('hex')
      : undefined;
    // В dev логируем полный текст без обрезки, чтобы видеть реальный prompt.
    // В проде содержимое скрывается через ALLOW_PROMPT_LOGS=false.
    const textPreview = ALLOW_PROMPT_LOGS ? textContent : undefined;

    // В проде не логируем содержимое; оставляем длину и хэш.
    return {
      index,
      role,
      textLength: textContent.length,
      ...(textPreview ? { textPreview } : {}),
      ...(textHash ? { textHash } : {}),
    };
  });
}

export const openaiProvider: LlmProviderPort = {
  id: 'openai',

  async chat({ messages, model, options }: any) {
    ensureOpenAiEnabled('chat');
    const useRelay = isRelayEnabled();
    const apiKey = useRelay ? undefined : process.env.NUXT_OPENAI_API_KEY;

    const usedModel = model || config.llm.openai.defaultModel;
    const maxTokens =
      options?.maxOutputTokens || config.llm.openai.defaultMaxOutputTokens;

    let attempt = 0;
    const maxRetries = 5;

    const org = process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID;
    const project =
      process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID;
    const idempotencyKey = randomUUID();
    const relayRequestId = randomUUID();

    const sessionId: string | undefined = options?.sessionId;
    const cached = sessionId ? sessionCache.get(sessionId) : undefined;
    const encryptedFromCache = cached?.encryptedReasoning ?? null;

    let tryEncrypted =
      ((process.env.NUXT_OPENAI_ENABLE_ENCRYPTED_REASONING ||
        process.env.OPENAI_ENABLE_ENCRYPTED_REASONING) ??
        'false') === 'true';

    const purpose = resolveRelayPurpose(options, false);

    if (options?.scenario === 'chips') {
      // Для чипов используем сырой prompt без чат-прелюда и памяти.
      const input = mapToResponsesInput(messages || []);
      const chipIntents = [
        'clarify',
        'example',
        'apply_to_self',
        'action_step',
        'reflect',
        'reframe',
        'summarize',
        'support',
      ];
      const chipSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['chips'],
        properties: {
          chips: {
            type: 'array',
            maxItems: 5,
            items: {
              // OpenAI strict json_schema не поддерживает oneOf.
              // Поэтому требуем все поля, а необязательные допускаем как null.
              type: 'object',
              additionalProperties: false,
              required: ['text', 'intent', 'kind', 'action', 'params'],
              properties: {
                text: { type: 'string', minLength: 1, maxLength: 80 },
                intent: { type: 'string', enum: chipIntents },
                kind: { type: 'string', enum: ['text', 'action'] },
                action: { type: ['string', 'null'] },
                params: {
                  type: ['object', 'null'],
                  additionalProperties: false,
                  required: ['trackId', 'collectionId'],
                  properties: {
                    trackId: { type: ['string', 'null'] },
                    collectionId: { type: ['string', 'null'] },
                  },
                },
              },
            },
          },
        },
      };
      const body: any = {
        model: usedModel,
        input,
        max_output_tokens: maxTokens,
        temperature: options?.temperature ?? 0.7,
        store: false,
        metadata: { app: 'mentai', feature: 'suggested_chips' },
        // Жестко требуем JSON по схеме, чтобы парсинг был стабильным.
        text: {
          format: {
            type: 'json_schema',
            name: 'suggested_chips',
            strict: true,
            schema: chipSchema,
          },
        },
      };
      const purpose = resolveRelayPurpose(options, false);

      try {
        const res: any = await sendResponsesRequest({
          body,
          purpose,
          timeoutMs: 30_000,
          apiKey,
          org,
          project,
          idempotencyKey,
          requestId: randomUUID(),
        });

        const content = extractText(res);
        return { role: 'assistant', content, model: usedModel };
      } catch (err: any) {
        const status =
          err?.response?.status || err?.status || err?.statusCode || 500;
        const openaiMessage =
          err?.data?.error?.message ||
          err?.data?.message ||
          err?.message ||
          'Unknown error';

        // Логируем краткую диагностику, чтобы понимать причину 400/422 от OpenAI.
        // Важно: не логируем весь prompt, чтобы не утекали пользовательские данные.
        console.error('[OpenAI chips] Request failed:', {
          status,
          model: usedModel,
          maxOutputTokens: maxTokens,
          temperature: body.temperature,
          inputItems: Array.isArray(input) ? input.length : 0,
          hasJsonSchema: Boolean(body?.text?.format?.schema),
          message: openaiMessage,
          errorType: err?.data?.error?.type,
          errorCode: err?.data?.error?.code,
        });

        // Fallback: если OpenAI отклонил structured output (json_schema),
        // пробуем повторить запрос без `text.format`, чтобы чипы не "умирали" целиком в dev.
        // Парсинг JSON будет выполнен на уровне suggested-chips.service.ts как и раньше.
        if (status === 400 || status === 422) {
          try {
            const fallbackBody = {
              ...body,
              text: {}, // без structured output
            };
            const fallbackRes: any = await sendResponsesRequest({
              body: fallbackBody,
              purpose,
              timeoutMs: 30_000,
              apiKey,
              org,
              project,
              idempotencyKey,
              requestId: randomUUID(),
            });
            const content = extractText(fallbackRes);
            console.warn(
              '[OpenAI chips] Fallback without json_schema succeeded'
            );
            return { role: 'assistant', content, model: usedModel };
          } catch (fallbackErr: any) {
            const fallbackStatus =
              fallbackErr?.response?.status ||
              fallbackErr?.status ||
              fallbackErr?.statusCode ||
              status;
            const fallbackMessage =
              fallbackErr?.data?.error?.message ||
              fallbackErr?.data?.message ||
              fallbackErr?.message ||
              openaiMessage;
            throw createError({
              statusCode: fallbackStatus,
              message: `OpenAI chips error (fallback failed): ${fallbackStatus} ${fallbackMessage}`,
            });
          }
        }

        throw createError({
          statusCode: status,
          message: `OpenAI chips error: ${status} ${openaiMessage}`,
        });
      }
    }

    if (options?.scenario === 'notifications') {
      // Для уведомлений используем переданный prompt как есть и требуем строгий JSON по схеме.
      const input = mapToResponsesInput(messages || []);
      // В Responses API json_schema должен иметь корневой type: "object".
      // Поэтому оборачиваем массив в объект { items: [...] }.
      const notificationSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              // В strict json_schema required должен включать все ключи из properties.
              required: ['text', 'imageTag', 'subtype'],
              properties: {
                text: { type: 'string', minLength: 1 },
                imageTag: {
                  type: ['string', 'null'],
                  enum: [
                    'harm_organs',
                    'harm_appearance',
                    'harm_mental',
                    'activity',
                    'nature',
                    'meditation',
                    'daily_life',
                    'neutral_abstract',
                    null,
                  ],
                },
                subtype: {
                  type: ['string', 'null'],
                  enum: ['reminder', 'informational', 'motivational', null],
                },
              },
            },
          },
        },
      };
      const body: any = {
        model: usedModel,
        input,
        max_output_tokens: maxTokens,
        temperature: options?.temperature ?? 0.7,
        store: false,
        metadata: { app: 'mentai', feature: 'notifications' },
        text: {
          format: {
            type: 'json_schema',
            name: 'notification_items',
            strict: true,
            schema: notificationSchema,
          },
        },
      };

      console.log('[OpenAI notifications] Отправка запроса уведомлений:', {
        model: usedModel,
        userId: options?.userId || 'unknown',
        messagesCount: (messages || []).length,
        temperature: body.temperature,
        maxOutputTokens: maxTokens,
        prompts: formatPromptsForLogging(input),
      });

      try {
        const res: any = await sendResponsesRequest({
          body,
          purpose,
          timeoutMs: 60_000, // Уведомления могут быть длинными, даём больше времени
          apiKey,
          org,
          project,
          idempotencyKey,
          requestId: relayRequestId,
        });
        const content = extractText(res);
        return { role: 'assistant', content, model: usedModel };
      } catch (err: any) {
        const status =
          err?.response?.status || err?.status || err?.statusCode || 500;
        const openaiMessage =
          err?.data?.error?.message ||
          err?.data?.message ||
          err?.message ||
          'Unknown error';

        console.error('[OpenAI notifications] Request failed:', {
          status,
          model: usedModel,
          maxOutputTokens: maxTokens,
          temperature: body.temperature,
          inputItems: Array.isArray(input) ? input.length : 0,
          hasJsonSchema: Boolean(body?.text?.format?.schema),
          message: openaiMessage,
          errorType: err?.data?.error?.type,
          errorCode: err?.data?.error?.code,
        });

        // Если structured output не поддержан, пробуем повторить без schema.
        if (status === 400 || status === 422) {
          try {
            const fallbackBody = {
              ...body,
              text: {}, // без structured output
            };
            const fallbackRes: any = await sendResponsesRequest({
              body: fallbackBody,
              purpose,
              timeoutMs: 60_000, // Уведомления могут быть длинными, даём больше времени
              apiKey,
              org,
              project,
              idempotencyKey,
              requestId: relayRequestId,
            });
            const content = extractText(fallbackRes);
            console.warn(
              '[OpenAI notifications] Fallback without json_schema succeeded'
            );
            return { role: 'assistant', content, model: usedModel };
          } catch (fallbackErr: any) {
            const fallbackStatus =
              fallbackErr?.response?.status ||
              fallbackErr?.status ||
              fallbackErr?.statusCode ||
              status;
            const fallbackMessage =
              fallbackErr?.data?.error?.message ||
              fallbackErr?.data?.message ||
              fallbackErr?.message ||
              openaiMessage;
            throw createError({
              statusCode: fallbackStatus,
              message: `OpenAI notifications error (fallback failed): ${fallbackStatus} ${fallbackMessage}`,
            });
          }
        }

        throw createError({
          statusCode: status,
          message: `OpenAI notifications error: ${status} ${openaiMessage}`,
        });
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Получаем настройки пользователя для управления памятью
        const chatSettings = options?.userId
          ? await readChatSettings(String(options.userId))
          : null;
        const enablePreviousResponseId =
          chatSettings?.enablePreviousResponseId ?? true;
        // Summary отключена глобально (см. SUMMARY_ENABLED), настройки пользователя игнорируем.
        const enableSummary =
          SUMMARY_ENABLED && (chatSettings?.enableSummary ?? true);
        // Получаем последний валидный response_id (если включено)
        let previousResponseId: string | undefined;
        if (enablePreviousResponseId && options?.userId) {
          try {
            const lastResponse = await responseIdStore.getLastValid(
              String(options.userId)
            );
            if (lastResponse) {
              const isValid = responseIdStore.isResponseValid(
                lastResponse.expiresAt
              );
              if (isValid) {
                previousResponseId = lastResponse.responseId;
              }
            }
          } catch (err) {
            console.error(
              '[OpenAI chat()] ❌ Failed to get previous_response_id:',
              err
            );
          }
        }

        // Memory-aware prelude: при повторных — подмешиваем summary (если включено)
        // Важно: isFirst должен учитывать не только summary, но и previous_response_id
        // Если хотя бы один механизм памяти включен и есть данные - это не первая сессия
        const hasPreviousResponseId =
          enablePreviousResponseId && previousResponseId;

        // Определяем isFirst: это первая сессия только если НЕТ ни summary, ни previous_response_id
        let sessionMemoryText = '';
        let isFirst = Boolean(options?.isFirstSession);

        // Summary-память сейчас отключена (SUMMARY_ENABLED = false).
        // Логику оставляем в коде для возможного будущего возвращения.
        if (enableSummary && options?.userId != null) {
          try {
            const all = await summaryStore.getSummaries(options.userId, 4); // Лимит последних 4 для оптимизации токенов
            if (all && all.length > 0) {
              sessionMemoryText = buildSessionMemoryText(
                all,
                options?.lang ?? 'ru'
                // Не передаем maxSummaryLength - truncation: "auto" обработает превышение контекста
              );
              isFirst = false; // Если есть summary - это не первая сессия
            }
          } catch {
            // Игнорируем: summary отключена на уровне продукта и не должна ломать чат.
          }
        }

        // Если есть previous_response_id - это точно не первая сессия
        if (hasPreviousResponseId) {
          isFirst = false;
        }

        const lang = options?.lang ?? 'ru';

        // Вычисляем responseNumber для ротации типов ответов
        // Считаем количество сообщений пользователя в текущей сессии
        const userMessagesCount = (messages || []).filter(
          (m: { role: string; content: string }) => m.role === 'user'
        ).length;
        const responseNumber = userMessagesCount + 1;

        // Извлекаем последнее сообщение пользователя (опционально, для detectApproachFromContext)
        const lastUserMessage =
          (messages || [])
            .filter((m: { role: string; content: string }) => m.role === 'user')
            .slice(-1)[0]?.content || '';

        // Для повторных сессий исключаем память из system и добавляем её отдельным developer-сообщением ниже
        const systemPrelude = buildChatPreludeWithMemory(
          {
            lang,
            user_locale: options?.user_locale,
            user_name: options?.user_name,
            user_gender: options?.user_gender,
          },
          {
            isFirstSession: isFirst,
            sessionMemoryText: sessionMemoryText,
            responseNumber,
            userMessage: lastUserMessage,
          }
        );

        const developerContext = buildDeveloperContext(
          {
            user_name: options?.user_name,
            user_gender: options?.user_gender,
          },
          { responseNumber }
        );

        // Собираем корректный массив сообщений с валидными типами контента
        const minimalMessages = lastUserMessage
          ? [{ role: 'user', content: lastUserMessage }]
          : [];

        const input = [
          {
            role: 'system',
            content: [{ type: 'input_text' as const, text: systemPrelude }],
          },
          ...(developerContext
            ? [
                {
                  role: 'developer' as const,
                  content: [
                    { type: 'input_text' as const, text: developerContext },
                  ],
                },
              ]
            : []),
          ...(options?.userPrompt
            ? [
                {
                  role: 'developer' as const,
                  content: [
                    {
                      type: 'input_text' as const,
                      text: String(options.userPrompt),
                    },
                  ],
                },
              ]
            : []),
          // В запрос отправляем только последнее сообщение пользователя.
          // Контекст держим только через previous_response_id, чтобы не раздувать входные токены.
          // История и summary намеренно не передаются (экономика + приватность).
          ...mapToResponsesInput(minimalMessages),
        ];
        const body: any = {
          model: usedModel,
          input,
          max_output_tokens: maxTokens,
          temperature: options?.temperature ?? 0.3,
          // store должен быть true только если включена память через previous_response_id
          store: enablePreviousResponseId,
          metadata: { app: 'mentai', feature: 'psych_support' },
          text: {}, // при необходимости можно добавить text.format с json_schema
          // ВАЖНО: truncation: "auto" автоматически усекает контекст, если его размер превышает
          // допустимый лимит. Это позволяет использовать previous_response_id даже для длинных диалогов.
          truncation: 'auto',
        };

        // Добавляем previous_response_id только если включено и есть валидный
        // Это позволяет модели помнить контекст предыдущих бесед для лучшего пользовательского опыта
        if (enablePreviousResponseId && previousResponseId) {
          body.previous_response_id = previousResponseId;
          body.store = true; // Принудительно устанавливаем store: true при использовании previous_response_id
        }

        if (tryEncrypted) {
          body.include = ['reasoning.encrypted_content'];
          if (encryptedFromCache) {
            body.reasoning = { encrypted_content: encryptedFromCache };
          }
        }

        // Логирование запроса терапии в OpenAI
        console.log('[OpenAI chat()] Отправка запроса терапии:', {
          model: usedModel,
          userId: options?.userId || 'unknown',
          sessionId: sessionId || 'none',
          isFirstSession: isFirst,
          hasPreviousResponseId: Boolean(previousResponseId),
          messagesCount: (messages || []).length,
          messagesInContext: minimalMessages.length,
          userMessagesCount,
          temperature: body.temperature,
          maxOutputTokens: maxTokens,
          store: body.store,
          hasPreviousResponseIdInBody: Boolean(body.previous_response_id),
          tryEncrypted,
          prompts: formatPromptsForLogging(input),
        });

        const res: any = await sendResponsesRequest({
          body,
          purpose,
          timeoutMs: 30_000,
          apiKey,
          org,
          project,
          idempotencyKey,
          requestId: relayRequestId,
        });

        const content = extractText(res);

        // Сохраняем response_id для следующего запроса (если включено)
        // В Responses API response_id может быть в res.id или в другом месте
        // Проверяем несколько возможных мест расположения response_id
        const responseId =
          res?.id ||
          res?.response?.id ||
          res?.response_id ||
          (res?.output?.[0] as any)?.id;

        if (enablePreviousResponseId && options?.userId) {
          if (responseId) {
            try {
              await responseIdStore.save(String(options.userId), responseId);
            } catch (err) {
              console.error(
                '[OpenAI chat()] ❌ Failed to save response_id:',
                err
              );
            }
          }
        }

        if (tryEncrypted) {
          const encryptedBlob =
            res?.reasoning?.encrypted_content ||
            res?.output?.find?.((x: any) => x?.type === 'reasoning')
              ?.encrypted_content ||
            res?.encrypted_content ||
            null;

          if (sessionId) {
            sessionCache.set(sessionId, {
              encryptedReasoning: encryptedBlob ?? encryptedFromCache ?? null,
              lastUsedModel: usedModel,
            });
          }
        }

        return { role: 'assistant', content, model: usedModel };
      } catch (err: any) {
        const status = err?.response?.status || err?.status || err?.statusCode;
        const headers = err?.response?.headers;
        const messageText = err?.data?.error?.message || err?.message || '';

        // Откат, если encrypted reasoning не поддержан
        if (
          status === 400 &&
          tryEncrypted &&
          /Encrypted content is not supported|encrypted_content/i.test(
            messageText
          )
        ) {
          tryEncrypted = false;
          if (sessionId) {
            const prev = sessionCache.get(sessionId);
            sessionCache.set(sessionId, {
              encryptedReasoning: null,
              lastUsedModel: prev?.lastUsedModel,
            });
          }
          continue;
        }

        if (status !== 429 || attempt >= maxRetries) {
          throw createError({
            statusCode: status || 500,
            message: `OpenAI error: ${status} ${err?.data?.error?.message ?? err?.message ?? ''}`,
          });
        }

        attempt += 1;

        const retryAfter = Number((headers as any)?.get?.('retry-after') ?? 0);
        const backoffMs =
          retryAfter > 0
            ? retryAfter * 1000
            : Math.min(2000 * 2 ** (attempt - 1), 15000) + Math.random() * 500;

        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
    }
  },

  async finishSession({ sessionId, allMessages, userId, model }: any) {
    ensureOpenAiEnabled('finish_session');
    if (!sessionId || !userId) {
      return;
    }

    // Summary отключена на уровне продукта: не генерируем и не сохраняем.
    // Очищаем кэш сессии и выходим, чтобы не тратить токены.
    if (!SUMMARY_ENABLED) {
      sessionCache.delete(sessionId);
      return;
    }

    // Проверяем настройки пользователя
    const chatSettings = await readChatSettings(String(userId));
    const enableSummary = chatSettings?.enableSummary ?? true;

    // Создаем summary только если включено
    if (!enableSummary) {
      sessionCache.delete(sessionId);
      return;
    }

    // Проверяем, что есть сообщения для создания summary
    if (!allMessages || allMessages.length === 0) {
      sessionCache.delete(sessionId);
      return;
    }

    const userMessages = (allMessages || []).filter(
      (m: { role: string; content: string }) =>
        m?.role === 'user' && String(m?.content || '').trim().length > 0
    );
    const totalUserChars = userMessages.reduce(
      (sum: number, m: { content: string }) =>
        sum + String(m?.content || '').trim().length,
      0
    );

    if (
      userMessages.length < MIN_SUMMARY_USER_MESSAGES ||
      totalUserChars < MIN_SUMMARY_USER_CHARS
    ) {
      sessionCache.delete(sessionId);
      return;
    }

    const useRelay = isRelayEnabled();
    const apiKey = useRelay ? undefined : process.env.NUXT_OPENAI_API_KEY;

    const usedModel = model || config.llm.openai.defaultModel;
    const org = process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID;
    const project =
      process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID;
    const idempotencyKey = randomUUID();
    const relayRequestId = randomUUID();

    const lastK = (allMessages || []).slice(-12);

    const systemSummary = buildSummaryPrompt({ lang: 'ru' });

    const input = [
      {
        role: 'system',
        content: [{ type: 'input_text' as const, text: systemSummary }],
      },
      ...mapToResponsesInput(lastK),
      {
        role: 'user',
        content: [
          { type: 'input_text' as const, text: 'Ответь строго валидным JSON.' },
        ],
      },
    ];

    const body: any = {
      model: usedModel,
      input,
      store: false, // Для finishSession всегда false
      include: [],
      text: {},
      max_output_tokens: 600,
      temperature: 0.2,
    };

    // Логирование запроса finishSession в OpenAI
    console.log(
      '[OpenAI finishSession()] Отправка запроса завершения сессии:',
      {
        model: usedModel,
        userId: String(userId),
        sessionId: sessionId || 'none',
        messagesCount: lastK.length,
        maxOutputTokens: body.max_output_tokens,
        temperature: body.temperature,
        prompts: formatPromptsForLogging(input),
      }
    );

    try {
      const res: any = await sendResponsesRequest({
        body,
        purpose: 'finish_session',
        timeoutMs: 30_000,
        apiKey,
        org,
        project,
        idempotencyKey,
        requestId: relayRequestId,
      });

      const raw = extractText(res);
      const parsed = parseStrictJson(raw);
      const normalized = validateAndNormalizeSummary(parsed);
      await summaryStore.save(userId, sessionId, JSON.stringify(normalized));
    } catch (error) {
      // Сохраняем пустой summary с правильной структурой в случае ошибки
      console.error(
        '[OpenAI finishSession] Error during summary generation:',
        error
      );
      const emptySummary = createEmptySummary();
      await summaryStore.save(userId, sessionId, JSON.stringify(emptySummary));
    } finally {
      sessionCache.delete(sessionId);
    }
  },

  async *chatStream({ messages, model, options }: any): AsyncIterable<string> {
    ensureOpenAiEnabled('chat_stream');
    const useRelay = isRelayEnabled();
    const apiKey = useRelay ? undefined : process.env.NUXT_OPENAI_API_KEY;
    if (!useRelay && !apiKey) {
      throw createError({
        statusCode: 500,
        message: 'NUXT_OPENAI_API_KEY is not set',
      });
    }

    // Получаем настройки пользователя для управления памятью
    const chatSettings = options?.userId
      ? await readChatSettings(String(options.userId))
      : null;
    const enablePreviousResponseId =
      chatSettings?.enablePreviousResponseId ?? true;
    // Summary отключена глобально (см. SUMMARY_ENABLED), настройки пользователя игнорируем.
    const enableSummary =
      SUMMARY_ENABLED && (chatSettings?.enableSummary ?? true);
    // ВАЖНО: Получаем последний валидный response_id ДО проверки welcome start
    // Это нужно для правильной работы памяти
    let previousResponseId: string | undefined;
    if (options?.userId) {
      try {
        const lastResponse = await responseIdStore.getLastValid(
          String(options.userId)
        );
        if (lastResponse) {
          const isValid = responseIdStore.isResponseValid(
            lastResponse.expiresAt
          );

          if (isValid) {
            previousResponseId = lastResponse.responseId;
          }
        }
      } catch (err) {
        console.error(
          '[OpenAI Stream] ❌ Failed to get previous_response_id:',
          err
        );
      }
    }

    const usedModel = model || config.llm.openai.defaultModel;
    const maxOutputTokens =
      options?.maxOutputTokens || config.llm.openai.defaultMaxOutputTokens;

    // Проверяем, является ли это стартом с welcome-экрана (messages пустой)
    const isWelcomeStart = (messages?.length || 0) === 0;

    // Важно: isFirst должен учитывать не только summary, но и previous_response_id
    // Если хотя бы один механизм памяти включен и есть данные - это не первая сессия
    const hasPreviousResponseId =
      enablePreviousResponseId && previousResponseId;

    let sessionMemoryText = '';
    let isFirst = Boolean(options?.isFirstSession);

    // Summary-память сейчас отключена (SUMMARY_ENABLED = false).
    // Логику оставляем в коде для возможного будущего возвращения.
    if (enableSummary && options?.userId != null) {
      try {
        const all = await summaryStore.getSummaries(options.userId, 10); // Лимит последних 10
        if (all && all.length > 0) {
          sessionMemoryText = buildSessionMemoryText(
            all,
            options?.lang ?? 'ru'
          );
          isFirst = false; // Если есть summary - это не первая сессия
        }
      } catch {
        // Игнорируем: summary отключена на уровне продукта и не должна ломать чат.
      }
    }

    // Если есть previous_response_id - это точно не первая сессия
    if (hasPreviousResponseId) {
      isFirst = false;
    }

    const lang = options?.lang ?? 'ru';
    const contextNote = options?.entryContext
      ? buildEntryContextDescription(options.entryContext)
      : '';

    // ОБРАБОТКА СТАРТА С WELCOME-ЭКРАНА
    if (isWelcomeStart) {
      // Загружаем welcome-промпт из БД (или используем дефолтный)
      let welcomePromptContent: string | null = null;
      if (options.userId) {
        try {
          welcomePromptContent = await welcomePromptStore.get(
            options.userId,
            isFirst,
            lang
          );
        } catch (err) {
          console.error('[OpenAI Stream] Failed to load welcome prompt:', err);
        }
      }

      // Если промпт не найден для пользователя, пробуем дефолтный
      if (!welcomePromptContent) {
        try {
          welcomePromptContent = await welcomePromptStore.getDefault(
            isFirst,
            lang
          );
        } catch (err) {
          console.error(
            '[OpenAI Stream] Failed to load default welcome prompt:',
            err
          );
        }
      }

      const numericUserId =
        options?.userId !== undefined ? Number(options.userId) : null;
      const timezone = resolveUserTimezone(options?.user_timezone);
      // Нормализуем пол: берём только allowlist значений из профиля.
      const userGender =
        options?.user_gender === 'male' || options?.user_gender === 'female'
          ? options.user_gender
          : null;
      const isThoughtDumpEntry = options?.entryContext?.type === 'thought_dump';
      const isPhobiasWelcomeEntry = isPhobiasEntryContext(
        options?.entryContext
      );
      const now = new Date();
      let canUseGreeting = false;
      let greetingName: string | null = null;
      let alternativeOpening: string | null = null;

      // Для thought dump не подставляем готовые стартовые шаблоны:
      // ответ должен начинаться сразу по содержанию выгрузки.
      if (
        !isThoughtDumpEntry &&
        numericUserId &&
        !Number.isNaN(numericUserId)
      ) {
        canUseGreeting = await reserveDailyGreeting({
          userId: numericUserId,
          timezone,
          now,
        });

        if (canUseGreeting) {
          greetingName = await getDailyGreetingName({
            userId: numericUserId,
            rawName: options?.user_name,
            timezone,
            now,
          });
        } else if (!isPhobiasWelcomeEntry) {
          alternativeOpening = pickAlternativeOpening({
            userId: numericUserId,
            timezone,
            sessionId: options?.sessionId,
            entryContext: options?.entryContext,
            userGender,
            now,
          });
        }
      }

      const openingMode =
        canUseGreeting || !alternativeOpening ? 'greeting' : 'alternative';

      // Формируем стартовый промпт
      const welcomePrompt = buildWelcomePrompt({
        isFirstSession: isFirst,
        sessionMemoryText: sessionMemoryText,
        lang,
        user_locale: options?.user_locale,
        user_name: options?.user_name,
        user_gender: options?.user_gender,
        greetingName,
        includeNameValidationPrompt: Boolean(greetingName),
        openingMode,
        openingLine: alternativeOpening ?? undefined,
        useGreeting: canUseGreeting,
        welcomePromptContent: welcomePromptContent || undefined,
        entryContext: options?.entryContext,
        disableOpeningTemplates: isThoughtDumpEntry || isPhobiasWelcomeEntry,
      });

      // System промпт для старта
      // Для welcome-старта responseNumber = 1 (первое сообщение)
      const responseNumber = 1;
      const systemPrelude = buildChatPreludeWithMemory(
        {
          lang,
          user_locale: options?.user_locale,
          user_name: options?.user_name,
          user_gender: options?.user_gender,
        },
        {
          isFirstSession: isFirst,
          sessionMemoryText: sessionMemoryText,
          responseNumber,
        }
      );

      // Для welcome-старта формируем input БЕЗ messages (они пустые)
      const input = [
        {
          role: 'system',
          content: [{ type: 'input_text' as const, text: systemPrelude }],
        },
        {
          role: 'developer',
          content: [{ type: 'input_text' as const, text: welcomePrompt }],
        },
        ...(options?.userPrompt
          ? [
              {
                role: 'developer' as const,
                content: [
                  {
                    type: 'input_text' as const,
                    text: options.userPrompt,
                  },
                ],
              },
            ]
          : []),
        // НЕ добавляем messages - они пустые для welcome-старта!
      ];

      const streamOptions: any = {
        model: usedModel,
        input,
        temperature: options?.temperature ?? 0.3,
        max_output_tokens: 400, // Ограничение для стартового сообщения (2-3 предложения)
        // store должен быть true только если включена память через previous_response_id
        store: enablePreviousResponseId,
        // ВАЖНО: truncation: "auto" автоматически усекает контекст, если его размер превышает
        // допустимый лимит. Это позволяет использовать previous_response_id даже для длинных диалогов,
        // сохраняя начало и конец беседы, удаляя избыточные части из середины.
        truncation: 'auto',
      };

      // Используем previous_response_id для сохранения контекста предыдущих бесед
      if (enablePreviousResponseId && previousResponseId) {
        streamOptions.previous_response_id = previousResponseId;
        streamOptions.store = true;
      }

      // Логирование запроса терапии в OpenAI (welcome-старт)
      console.log(
        '[OpenAI chatStream()] Отправка запроса терапии (welcome-старт):',
        {
          model: usedModel,
          userId: options?.userId || 'unknown',
          sessionId: options?.sessionId || 'none',
          isFirstSession: isFirst,
          hasPreviousResponseId: Boolean(previousResponseId),
          hasWelcomePrompt: Boolean(welcomePromptContent),
          temperature: streamOptions.temperature,
          maxOutputTokens: streamOptions.max_output_tokens,
          store: streamOptions.store,
          hasPreviousResponseIdInOptions: Boolean(
            streamOptions.previous_response_id
          ),
          prompts: formatPromptsForLogging(input),
        }
      );

      let responseId: string | undefined;
      let deltaCount = 0;

      if (useRelay) {
        const { stream, responseIdPromise } = await relayResponsesStream({
          path: '/v1/responses',
          body: { ...streamOptions, stream: true },
          purpose: 'chat_stream',
          requestId: randomUUID(),
        });

        try {
          for await (const delta of stream) {
            deltaCount++;
            yield String(delta);
          }
        } catch (streamError: any) {
          console.error(
            '[Relay Stream] Error in welcome stream loop:',
            'userId:',
            options?.userId,
            'deltaCount:',
            deltaCount,
            'error:',
            streamError?.message || String(streamError)
          );
          throw streamError;
        }

        responseId = await responseIdPromise;
      } else {
        const openai = createOpenAiClient(apiKey!);
        const stream = await openai.responses.stream(streamOptions);

        try {
          for await (const ev of stream as any) {
            if (ev?.type === 'response.output_text.delta' && ev?.delta) {
              deltaCount++;
              yield String(ev.delta);
            }
            if (ev?.type === 'response.completed') {
              responseId =
                ev?.response?.id ||
                ev?.id ||
                ev?.response_id ||
                (ev?.response as any)?.id;
              break;
            }
            if (ev?.type === 'response.error') {
              console.error(
                '[OpenAI Stream] Stream error event:',
                'userId:',
                options?.userId,
                'error:',
                ev.error?.message || 'Unknown error'
              );
              throw createError({
                statusCode: 500,
                message: ev.error?.message || 'Stream error',
              });
            }
          }
        } catch (streamError: any) {
          console.error(
            '[OpenAI Stream] Error in welcome stream loop:',
            'userId:',
            options?.userId,
            'deltaCount:',
            deltaCount,
            'error:',
            streamError?.message || String(streamError)
          );
          throw streamError;
        }
      }

      // Сохраняем response_id для следующего запроса (если включено)
      if (enablePreviousResponseId && options?.userId && responseId) {
        try {
          await responseIdStore.save(String(options.userId), responseId);
        } catch (err) {
          console.error('[OpenAI Stream] ❌ Failed to save response_id:', err);
        }
      }

      return; // Выходим из функции после welcome-старта
    }

    // ОБЫЧНЫЙ РЕЖИМ ДИАЛОГА (messages не пустые)
    // Вычисляем responseNumber для ротации типов ответов
    const userMessagesCount = (messages || []).filter(
      (m: { role: string; content: string }) => m.role === 'user'
    ).length;
    const responseNumber = userMessagesCount + 1;

    // Извлекаем последнее сообщение пользователя (опционально, для detectApproachFromContext)
    const lastUserMessage =
      (messages || [])
        .filter((m: { role: string; content: string }) => m.role === 'user')
        .slice(-1)[0]?.content || '';

    const systemPrelude = buildChatPreludeWithMemory(
      {
        lang,
        user_locale: options?.user_locale,
        user_name: options?.user_name,
        user_gender: options?.user_gender,
      },
      {
        isFirstSession: isFirst,
        sessionMemoryText: sessionMemoryText,
        responseNumber,
        userMessage: lastUserMessage,
      }
    );

    const developerContext = buildDeveloperContext(
      {
        user_name: options?.user_name,
        user_gender: options?.user_gender,
      },
      { responseNumber }
    );
    const developerMessages: Array<{
      role: 'developer';
      content: Array<{ type: 'input_text'; text: string }>;
    }> = [];

    if (developerContext) {
      developerMessages.push({
        role: 'developer',
        content: [{ type: 'input_text' as const, text: developerContext }],
      });
    }

    if (contextNote) {
      developerMessages.push({
        role: 'developer',
        content: [{ type: 'input_text' as const, text: contextNote }],
      });
    }

    const input = [
      {
        role: 'system',
        content: [{ type: 'input_text' as const, text: systemPrelude }],
      },
      ...developerMessages,
      ...(options?.userPrompt
        ? [
            {
              role: 'developer' as const,
              content: [
                {
                  type: 'input_text' as const,
                  text: String(options.userPrompt),
                },
              ],
            },
          ]
        : []),
      // В запрос отправляем только последнее сообщение пользователя.
      // Контекст держим только через previous_response_id, чтобы не раздувать входные токены.
      // История и summary намеренно не передаются (экономика + приватность).
      ...mapToResponsesInput(
        lastUserMessage ? [{ role: 'user', content: lastUserMessage }] : []
      ),
    ];

    // ВАЖНО: История сообщений намеренно не отправляется.
    // Контекст — только через previous_response_id (если включён пользователем).

    const streamOptions: any = {
      model: usedModel,
      input,
      temperature: options?.temperature ?? 0.3,
      max_output_tokens: maxOutputTokens,
      // store должен быть true только если включена память через previous_response_id
      store: enablePreviousResponseId,
      // ВАЖНО: truncation: "auto" автоматически усекает контекст, если его размер превышает
      // допустимый лимит. Это позволяет использовать previous_response_id даже для длинных диалогов,
      // сохраняя начало и конец беседы, удаляя избыточные части из середины.
      truncation: 'auto',
    };

    // Добавляем previous_response_id только если включено и есть валидный
    // Это позволяет модели помнить контекст предыдущих бесед для лучшего пользовательского опыта
    if (enablePreviousResponseId && previousResponseId) {
      streamOptions.previous_response_id = previousResponseId;
      streamOptions.store = true; // Принудительно устанавливаем store: true при использовании previous_response_id
    }

    // Логирование запроса терапии в OpenAI (обычный режим диалога)
    console.log(
      '[OpenAI chatStream()] Отправка запроса терапии (обычный режим):',
      {
        model: usedModel,
        userId: options?.userId || 'unknown',
        sessionId: options?.sessionId || 'none',
        isFirstSession: isFirst,
        hasPreviousResponseId: Boolean(previousResponseId),
        messagesCount: (messages || []).length,
        messagesInContext: lastUserMessage ? 1 : 0,
        userMessagesCount,
        responseNumber,
        hasEntryContext: Boolean(contextNote),
        hasUserPrompt: Boolean(options?.userPrompt),
        temperature: streamOptions.temperature,
        maxOutputTokens: streamOptions.max_output_tokens,
        store: streamOptions.store,
        hasPreviousResponseIdInOptions: Boolean(
          streamOptions.previous_response_id
        ),
        prompts: formatPromptsForLogging(input),
      }
    );
    let responseId: string | undefined;
    if (useRelay) {
      const { stream, responseIdPromise } = await relayResponsesStream({
        path: '/v1/responses',
        body: { ...streamOptions, stream: true },
        purpose: 'chat_stream',
        requestId: randomUUID(),
      });

      let streamError: unknown;
      let deltaCount = 0;
      try {
        for await (const delta of stream) {
          deltaCount++;
          yield String(delta);
        }
      } catch (err) {
        streamError = err;
        console.error(
          '[Relay Stream] Error in chat stream loop:',
          'userId:',
          options?.userId,
          'deltaCount:',
          deltaCount,
          'error:',
          (err as Error)?.message || String(err)
        );
      } finally {
        responseId = await responseIdPromise;
      }

      if (streamError) {
        throw streamError;
      }
    } else {
      const openai = createOpenAiClient(apiKey!);
      const stream = await openai.responses.stream(streamOptions);

      let streamError: unknown;
      let deltaCount = 0;
      try {
        for await (const ev of stream as any) {
          if (ev?.type === 'response.output_text.delta' && ev?.delta) {
            deltaCount++;
            yield String(ev.delta);
          }
          if (ev?.type === 'response.completed') {
            // Сохраняем response_id из завершенного ответа
            // В Responses API stream response_id может быть в разных местах
            responseId =
              ev?.response?.id ||
              ev?.id ||
              ev?.response_id ||
              (ev?.response as any)?.id;
            break;
          }
          if (ev?.type === 'response.error') {
            throw createError({
              statusCode: 500,
              message: ev.error?.message || 'Stream error',
            });
          }
        }
      } catch (err) {
        streamError = err;
        console.error(
          '[OpenAI Stream] Error in chat stream loop:',
          'userId:',
          options?.userId,
          'deltaCount:',
          deltaCount,
          'error:',
          (err as Error)?.message || String(err)
        );
      }

      if (streamError) {
        throw streamError;
      }
    }

    // Сохраняем response_id для следующего запроса (если включено)
    if (enablePreviousResponseId && options?.userId) {
      if (responseId) {
        try {
          await responseIdStore.save(String(options.userId), responseId);
        } catch (err) {
          console.error('[OpenAI Stream] ❌ Failed to save response_id:', err);
        }
      }
    }

    if (options?.scenario === 'notifications') {
      // Для уведомлений используем переданный prompt как есть (без чат-прелюда).
      const input = mapToResponsesInput(messages || []);
      const body: any = {
        model: usedModel,
        input,
        max_output_tokens: maxTokens,
        temperature: options?.temperature ?? 0.7,
        store: false,
        metadata: { app: 'mentai', feature: 'notifications' },
        text: {}, // при необходимости можно добавить text.format с json_schema
      };

      console.log('[OpenAI notifications] Отправка запроса уведомлений:', {
        model: usedModel,
        userId: options?.userId || 'unknown',
        messagesCount: (messages || []).length,
        temperature: body.temperature,
        maxOutputTokens: maxTokens,
        prompts: formatPromptsForLogging(input),
      });

      const res: any = await sendResponsesRequest({
        body,
        purpose,
        timeoutMs: 30_000,
        apiKey,
        org,
        project,
        idempotencyKey,
        requestId: relayRequestId,
      });

      const content = extractText(res);
      return { role: 'assistant', content, model: usedModel };
    }
  },
};
