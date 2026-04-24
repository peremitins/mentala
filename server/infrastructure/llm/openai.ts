// server/infrastructure/llm/openai.ts

import { randomUUID } from 'node:crypto';
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
import { readChatSettings } from '../../utils/storage';
import { welcomePromptStore } from '../../utils/welcomePromptStore';
import { chatSessionMemoryStore } from '../../utils/chatSessionMemoryStore';
import {
  buildSessionMemoryPromptBlocks,
  estimateTokensByTexts,
  recordSuccessfulChatTurn,
  resolveChatMemoryContext,
} from '@/server/application/chat/chatMemory.service';
import {
  getDailyGreetingName,
  pickAlternativeOpening,
  reserveDailyGreeting,
  resolveUserTimezone,
} from '@/server/application/chat/name-greeting.service';
import { resolveAssistantPersonaFromVoice } from '@/server/application/chat/assistant-persona';
import { isPhobiasEntryContext } from '@/server/application/chat/phobias-entry.service';
import {
  buildChatPrelude,
  buildWelcomePrompt,
  buildEntryContextDescription,
  buildSessionBootstrapDeveloperContext,
  buildTurnDeveloperContext,
} from '@@/server/application/prompts';
import { formatPromptsForLogging, logOpenAiUsage } from './openaiLogging';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

// Временно отключаем отправку запросов в OpenAI (чат и уведомления).
const OPENAI_REQUESTS_DISABLED = false;

// In-memory cache for current session encrypted reasoning
const sessionCache = new Map<
  string,
  { encryptedReasoning?: string | null; lastUsedModel?: string }
>();

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
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'intent'],
              properties: {
                text: { type: 'string', minLength: 1, maxLength: 80 },
                intent: { type: 'string', enum: chipIntents },
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
        const requestStartedAtMs = Date.now();
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
        logOpenAiUsage({
          scope: 'chips',
          model: usedModel,
          input,
          usageSource: res,
          latencyMs: Date.now() - requestStartedAtMs,
          outputTextChars: content.length,
          userId: options?.userId,
          sessionId: options?.sessionId,
          extra: {
            maxOutputTokens: maxTokens,
          },
        });
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
        const requestStartedAtMs = Date.now();
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
        logOpenAiUsage({
          scope: 'notifications',
          model: usedModel,
          input,
          usageSource: res,
          latencyMs: Date.now() - requestStartedAtMs,
          outputTextChars: content.length,
          userId: options?.userId,
          extra: {
            maxOutputTokens: maxTokens,
          },
        });
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
        const assistantPersona = resolveAssistantPersonaFromVoice(
          chatSettings?.assistantVoice
        );
        const enablePreviousResponseId =
          chatSettings?.enablePreviousResponseId ?? true;
        const lang = options?.lang ?? 'ru';
        const numericUserId =
          options?.userId !== undefined ? Number(options.userId) : NaN;
        const therapySessionId =
          typeof options?.therapySessionId === 'number'
            ? options.therapySessionId
            : null;
        const canPersistServerTranscript =
          therapySessionId !== null && Number.isFinite(numericUserId);
        const canUseSessionMemory =
          enablePreviousResponseId && canPersistServerTranscript;

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

        const systemBootstrap = buildChatPrelude({
          lang,
          user_locale: options?.user_locale,
          user_name: options?.user_name,
          user_gender: options?.user_gender,
        });
        const bootstrapDeveloperContext = buildSessionBootstrapDeveloperContext(
          {
            user_name: options?.user_name,
            user_gender: options?.user_gender,
            assistant_gender: assistantPersona.gender,
            assistant_display_name: assistantPersona.displayName,
            addressing: options?.addressing,
            toneKey: options?.toneKey,
            toneLabel: options?.toneLabel,
            toneDescription: options?.toneDescription,
            onboardingReasons: options?.onboardingReasons,
          }
        );
        const turnDeveloperContext = buildTurnDeveloperContext({
          responseNumber,
        });

        const memoryContext =
          canUseSessionMemory && therapySessionId !== null
            ? await resolveChatMemoryContext({
                userId: numericUserId,
                therapySessionId,
                model: usedModel,
                enableMemory: true,
                estimatedBootstrapTokens: estimateTokensByTexts([
                  systemBootstrap,
                  bootstrapDeveloperContext,
                ]),
                estimatedPerTurnTokens: estimateTokensByTexts([
                  turnDeveloperContext,
                  String(options?.userPrompt || ''),
                  lastUserMessage,
                ]),
                isSafeUserTurn: Boolean(lastUserMessage.trim()),
                requestMessages: messages,
              })
            : {
                previousResponseId: null,
                shouldSendBootstrap: true,
                isFirstSession: true,
                activeBacklogContext: null,
                durableUserMemory: null,
                handoffSummary: null,
                runtimeCompactState: null,
                compactionReason: null,
                estimatedNextInputTokens: estimateTokensByTexts([
                  systemBootstrap,
                  bootstrapDeveloperContext,
                  turnDeveloperContext,
                  String(options?.userPrompt || ''),
                  lastUserMessage,
                ]),
              };
        const previousResponseId =
          memoryContext.previousResponseId || undefined;
        const isFirst = memoryContext.isFirstSession;
        const sessionMemoryBlocks = buildSessionMemoryPromptBlocks({
          activeBacklogContext: memoryContext.activeBacklogContext,
          durableUserMemory: memoryContext.durableUserMemory,
          handoffSummary: memoryContext.handoffSummary,
          runtimeCompactState: memoryContext.runtimeCompactState,
        });

        // Собираем корректный массив сообщений с валидными типами контента
        const minimalMessages = lastUserMessage
          ? [{ role: 'user', content: lastUserMessage }]
          : [];

        const input = [
          ...(memoryContext.shouldSendBootstrap
            ? [
                {
                  role: 'system' as const,
                  content: [
                    { type: 'input_text' as const, text: systemBootstrap },
                  ],
                },
                {
                  role: 'developer' as const,
                  content: [
                    {
                      type: 'input_text' as const,
                      text: bootstrapDeveloperContext,
                    },
                  ],
                },
                ...sessionMemoryBlocks.map((block) => ({
                  role: 'developer' as const,
                  content: [{ type: 'input_text' as const, text: block }],
                })),
              ]
            : []),
          {
            role: 'developer' as const,
            content: [
              { type: 'input_text' as const, text: turnDeveloperContext },
            ],
          },
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
          store: canUseSessionMemory,
          metadata: { app: 'mentai', feature: 'psych_support' },
          text: {}, // при необходимости можно добавить text.format с json_schema
          // ВАЖНО: truncation: "auto" автоматически усекает контекст, если его размер превышает
          // допустимый лимит. Это позволяет использовать previous_response_id даже для длинных диалогов.
          truncation: 'auto',
        };

        // Добавляем previous_response_id только если включено и есть валидный
        // Это позволяет модели помнить контекст предыдущих бесед для лучшего пользовательского опыта
        if (canUseSessionMemory && previousResponseId) {
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
          estimatedNextInputTokens: memoryContext.estimatedNextInputTokens,
          compactionReason: memoryContext.compactionReason,
          temperature: body.temperature,
          maxOutputTokens: maxTokens,
          store: body.store,
          hasPreviousResponseIdInBody: Boolean(body.previous_response_id),
          tryEncrypted,
          prompts: formatPromptsForLogging(input),
        });

        const requestStartedAtMs = Date.now();
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
        logOpenAiUsage({
          scope: 'chat',
          model: usedModel,
          input,
          usageSource: res,
          latencyMs: Date.now() - requestStartedAtMs,
          outputTextChars: content.length,
          userId: options?.userId,
          sessionId,
          extra: {
            mode: 'sync',
            isFirstSession: isFirst,
            hasPreviousResponseId: Boolean(previousResponseId),
            responseNumber,
            userMessagesCount,
          },
        });

        // Сохраняем response_id для следующего запроса (если включено)
        // В Responses API response_id может быть в res.id или в другом месте
        // Проверяем несколько возможных мест расположения response_id
        const responseId =
          res?.id ||
          res?.response?.id ||
          res?.response_id ||
          (res?.output?.[0] as any)?.id;

        if (canPersistServerTranscript && therapySessionId !== null) {
          await recordSuccessfulChatTurn({
            userId: numericUserId,
            therapySessionId,
            turnIndex: responseNumber,
            enableMemory: canUseSessionMemory,
            conversationMessages: messages,
            userMessage: lastUserMessage,
            assistantMessage: content,
            responseId: responseId ? String(responseId) : null,
            usageSource: res,
          });
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
    void allMessages;
    void userId;
    void model;
    if (!sessionId) {
      return;
    }

    // Канонический summary pipeline теперь запускается server-side через therapySession end + BullMQ.
    // Этот метод оставлен только для совместимости со старым endpoint /api/session/finish.
    sessionCache.delete(sessionId);
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
    const assistantPersona = resolveAssistantPersonaFromVoice(
      chatSettings?.assistantVoice
    );
    const enablePreviousResponseId =
      chatSettings?.enablePreviousResponseId ?? true;
    const usedModel = model || config.llm.openai.defaultModel;
    const maxOutputTokens =
      options?.maxOutputTokens || config.llm.openai.defaultMaxOutputTokens;
    const numericUserId =
      options?.userId !== undefined ? Number(options.userId) : NaN;
    const therapySessionId =
      typeof options?.therapySessionId === 'number'
        ? options.therapySessionId
        : null;
    const canPersistServerTranscript =
      therapySessionId !== null && Number.isFinite(numericUserId);
    const canUseSessionMemory =
      enablePreviousResponseId && canPersistServerTranscript;

    // Проверяем, является ли это стартом с welcome-экрана (messages пустой)
    const isWelcomeStart = (messages?.length || 0) === 0;

    const lang = options?.lang ?? 'ru';
    const contextNote = options?.entryContext
      ? buildEntryContextDescription(options.entryContext)
      : '';
    const systemBootstrap = buildChatPrelude({
      lang,
      user_locale: options?.user_locale,
      user_name: options?.user_name,
      user_gender: options?.user_gender,
    });
    const bootstrapDeveloperContext = buildSessionBootstrapDeveloperContext({
      user_name: options?.user_name,
      user_gender: options?.user_gender,
      assistant_gender: assistantPersona.gender,
      assistant_display_name: assistantPersona.displayName,
      addressing: options?.addressing,
      toneKey: options?.toneKey,
      toneLabel: options?.toneLabel,
      toneDescription: options?.toneDescription,
      onboardingReasons: options?.onboardingReasons,
    });

    // ОБРАБОТКА СТАРТА С WELCOME-ЭКРАНА
    if (isWelcomeStart) {
      const welcomeMemoryContext =
        canUseSessionMemory && therapySessionId !== null
          ? await resolveChatMemoryContext({
              userId: numericUserId,
              therapySessionId,
              model: usedModel,
              enableMemory: true,
              estimatedBootstrapTokens: estimateTokensByTexts([
                systemBootstrap,
                bootstrapDeveloperContext,
              ]),
              estimatedPerTurnTokens: estimateTokensByTexts([
                String(options?.userPrompt || ''),
              ]),
              isSafeUserTurn: false,
              requestMessages: messages,
            })
          : {
              previousResponseId: null,
              shouldSendBootstrap: true,
              isFirstSession: true,
              activeBacklogContext: null,
              durableUserMemory: null,
              handoffSummary: null,
              runtimeCompactState: null,
              compactionReason: null,
              estimatedNextInputTokens: estimateTokensByTexts([
                systemBootstrap,
                bootstrapDeveloperContext,
                String(options?.userPrompt || ''),
              ]),
            };
      const previousResponseId =
        welcomeMemoryContext.previousResponseId || undefined;
      const isFirst = welcomeMemoryContext.isFirstSession;
      const sessionMemoryBlocks = buildSessionMemoryPromptBlocks({
        activeBacklogContext: welcomeMemoryContext.activeBacklogContext,
        durableUserMemory: welcomeMemoryContext.durableUserMemory,
        handoffSummary: welcomeMemoryContext.handoffSummary,
        runtimeCompactState: welcomeMemoryContext.runtimeCompactState,
      });

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
            addressing: options?.addressing,
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
        sessionMemoryText: '',
        lang,
        user_locale: options?.user_locale,
        user_name: options?.user_name,
        user_gender: options?.user_gender,
        assistant_gender: assistantPersona.gender,
        assistant_display_name: assistantPersona.displayName,
        addressing: options?.addressing,
        toneKey: options?.toneKey,
        toneLabel: options?.toneLabel,
        toneDescription: options?.toneDescription,
        onboardingReasons: options?.onboardingReasons,
        greetingName,
        includeNameValidationPrompt: Boolean(greetingName),
        openingMode,
        openingLine: alternativeOpening ?? undefined,
        useGreeting: canUseGreeting,
        welcomePromptContent: welcomePromptContent || undefined,
        entryContext: options?.entryContext,
        disableOpeningTemplates: isThoughtDumpEntry || isPhobiasWelcomeEntry,
      });

      // Для welcome-старта формируем input БЕЗ messages (они пустые)
      const input = [
        ...(welcomeMemoryContext.shouldSendBootstrap
          ? [
              {
                role: 'system' as const,
                content: [
                  { type: 'input_text' as const, text: systemBootstrap },
                ],
              },
              {
                role: 'developer' as const,
                content: [
                  {
                    type: 'input_text' as const,
                    text: bootstrapDeveloperContext,
                  },
                ],
              },
              ...sessionMemoryBlocks.map((block) => ({
                role: 'developer' as const,
                content: [{ type: 'input_text' as const, text: block }],
              })),
            ]
          : []),
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
        store: canUseSessionMemory,
        // ВАЖНО: truncation: "auto" автоматически усекает контекст, если его размер превышает
        // допустимый лимит. Это позволяет использовать previous_response_id даже для длинных диалогов,
        // сохраняя начало и конец беседы, удаляя избыточные части из середины.
        truncation: 'auto',
      };

      // Используем previous_response_id для сохранения контекста предыдущих бесед
      if (canUseSessionMemory && previousResponseId) {
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
          estimatedNextInputTokens:
            welcomeMemoryContext.estimatedNextInputTokens,
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
      let streamedTextChars = 0;
      let completedResponse: Record<string, unknown> | null = null;
      const streamStartedAtMs = Date.now();

      if (useRelay) {
        const { stream, completionPromise } = await relayResponsesStream({
          path: '/v1/responses',
          body: { ...streamOptions, stream: true },
          purpose: 'chat_stream',
          requestId: randomUUID(),
        });

        try {
          for await (const delta of stream) {
            deltaCount++;
            const normalizedDelta = String(delta);
            streamedTextChars += normalizedDelta.length;
            yield normalizedDelta;
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

        const completion = await completionPromise;
        responseId = completion.responseId;
        completedResponse = completion.response || null;
      } else {
        const openai = createOpenAiClient(apiKey!);
        const stream = await openai.responses.stream(streamOptions);

        try {
          for await (const ev of stream as any) {
            if (ev?.type === 'response.output_text.delta' && ev?.delta) {
              deltaCount++;
              const normalizedDelta = String(ev.delta);
              streamedTextChars += normalizedDelta.length;
              yield normalizedDelta;
            }
            if (
              ev?.type === 'response.completed' ||
              ev?.type === 'response.done'
            ) {
              responseId =
                ev?.response?.id ||
                ev?.id ||
                ev?.response_id ||
                (ev?.response as any)?.id;
              completedResponse =
                ev?.response && typeof ev.response === 'object'
                  ? (ev.response as Record<string, unknown>)
                  : null;
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

      // Welcome-ответ не считается turn, но response_id нужен для продолжения этой же chain.
      if (canUseSessionMemory && therapySessionId !== null && responseId) {
        try {
          await chatSessionMemoryStore.saveResponseId({
            therapySessionId,
            userId: numericUserId,
            responseId: String(responseId),
          });
        } catch (err) {
          console.error(
            '[OpenAI Stream] ❌ Failed to save session-scoped response_id:',
            err
          );
        }
      }

      logOpenAiUsage({
        scope: 'chat_welcome_stream',
        model: usedModel,
        input,
        usageSource: completedResponse,
        latencyMs: Date.now() - streamStartedAtMs,
        outputTextChars: streamedTextChars,
        userId: options?.userId,
        sessionId: options?.sessionId,
        extra: {
          isFirstSession: isFirst,
          hasPreviousResponseId: Boolean(previousResponseId),
          deltaCount,
          hasWelcomePrompt: Boolean(welcomePromptContent),
        },
      });

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
    const turnDeveloperContext = buildTurnDeveloperContext({
      responseNumber,
    });
    const memoryContext =
      canUseSessionMemory && therapySessionId !== null
        ? await resolveChatMemoryContext({
            userId: numericUserId,
            therapySessionId,
            model: usedModel,
            enableMemory: true,
            estimatedBootstrapTokens: estimateTokensByTexts([
              systemBootstrap,
              bootstrapDeveloperContext,
            ]),
            estimatedPerTurnTokens: estimateTokensByTexts([
              turnDeveloperContext,
              contextNote,
              String(options?.userPrompt || ''),
              lastUserMessage,
            ]),
            isSafeUserTurn: Boolean(lastUserMessage.trim()),
            requestMessages: messages,
          })
        : {
            previousResponseId: null,
            shouldSendBootstrap: true,
            isFirstSession: true,
            activeBacklogContext: null,
            durableUserMemory: null,
            handoffSummary: null,
            runtimeCompactState: null,
            compactionReason: null,
            estimatedNextInputTokens: estimateTokensByTexts([
              systemBootstrap,
              bootstrapDeveloperContext,
              turnDeveloperContext,
              contextNote,
              String(options?.userPrompt || ''),
              lastUserMessage,
            ]),
          };
    const previousResponseId = memoryContext.previousResponseId || undefined;
    const isFirst = memoryContext.isFirstSession;
    const sessionMemoryBlocks = buildSessionMemoryPromptBlocks({
      activeBacklogContext: memoryContext.activeBacklogContext,
      durableUserMemory: memoryContext.durableUserMemory,
      handoffSummary: memoryContext.handoffSummary,
      runtimeCompactState: memoryContext.runtimeCompactState,
    });
    const developerMessages: Array<{
      role: 'developer';
      content: Array<{ type: 'input_text'; text: string }>;
    }> = [];

    developerMessages.push({
      role: 'developer',
      content: [{ type: 'input_text' as const, text: turnDeveloperContext }],
    });

    if (contextNote) {
      developerMessages.push({
        role: 'developer',
        content: [{ type: 'input_text' as const, text: contextNote }],
      });
    }

    const input = [
      ...(memoryContext.shouldSendBootstrap
        ? [
            {
              role: 'system' as const,
              content: [{ type: 'input_text' as const, text: systemBootstrap }],
            },
            {
              role: 'developer' as const,
              content: [
                {
                  type: 'input_text' as const,
                  text: bootstrapDeveloperContext,
                },
              ],
            },
            ...sessionMemoryBlocks.map((block) => ({
              role: 'developer' as const,
              content: [{ type: 'input_text' as const, text: block }],
            })),
          ]
        : []),
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
      store: canUseSessionMemory,
      // ВАЖНО: truncation: "auto" автоматически усекает контекст, если его размер превышает
      // допустимый лимит. Это позволяет использовать previous_response_id даже для длинных диалогов,
      // сохраняя начало и конец беседы, удаляя избыточные части из середины.
      truncation: 'auto',
    };

    // Добавляем previous_response_id только если включено и есть валидный
    // Это позволяет модели помнить контекст предыдущих бесед для лучшего пользовательского опыта
    if (canUseSessionMemory && previousResponseId) {
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
        estimatedNextInputTokens: memoryContext.estimatedNextInputTokens,
        compactionReason: memoryContext.compactionReason,
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
    let streamedTextChars = 0;
    let streamedText = '';
    let completedResponse: Record<string, unknown> | null = null;
    const streamStartedAtMs = Date.now();
    if (useRelay) {
      const { stream, completionPromise } = await relayResponsesStream({
        path: '/v1/responses',
        body: { ...streamOptions, stream: true },
        purpose: 'chat_stream',
        requestId: randomUUID(),
      });

      let streamError: unknown;
      try {
        for await (const delta of stream) {
          deltaCount++;
          const normalizedDelta = String(delta);
          streamedText += normalizedDelta;
          streamedTextChars += normalizedDelta.length;
          yield normalizedDelta;
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
        const completion = await completionPromise;
        responseId = completion.responseId;
        completedResponse = completion.response || null;
      }

      if (streamError) {
        throw streamError;
      }
    } else {
      const openai = createOpenAiClient(apiKey!);
      const stream = await openai.responses.stream(streamOptions);

      let streamError: unknown;
      try {
        for await (const ev of stream as any) {
          if (ev?.type === 'response.output_text.delta' && ev?.delta) {
            deltaCount++;
            const normalizedDelta = String(ev.delta);
            streamedText += normalizedDelta;
            streamedTextChars += normalizedDelta.length;
            yield normalizedDelta;
          }
          if (
            ev?.type === 'response.completed' ||
            ev?.type === 'response.done'
          ) {
            // Сохраняем response_id из завершенного ответа
            // В Responses API stream response_id может быть в разных местах
            responseId =
              ev?.response?.id ||
              ev?.id ||
              ev?.response_id ||
              (ev?.response as any)?.id;
            completedResponse =
              ev?.response && typeof ev.response === 'object'
                ? (ev.response as Record<string, unknown>)
                : null;
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

    logOpenAiUsage({
      scope: 'chat_stream',
      model: usedModel,
      input,
      usageSource: completedResponse,
      latencyMs: Date.now() - streamStartedAtMs,
      outputTextChars: streamedTextChars,
      userId: options?.userId,
      sessionId: options?.sessionId,
      extra: {
        isFirstSession: isFirst,
        hasPreviousResponseId: Boolean(previousResponseId),
        responseNumber,
        userMessagesCount,
        deltaCount,
      },
    });

    if (canPersistServerTranscript && therapySessionId !== null) {
      await recordSuccessfulChatTurn({
        userId: numericUserId,
        therapySessionId,
        turnIndex: responseNumber,
        enableMemory: canUseSessionMemory,
        conversationMessages: messages,
        userMessage: lastUserMessage,
        assistantMessage: streamedText,
        responseId: responseId ? String(responseId) : null,
        usageSource: completedResponse,
      });
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
