// server/infrastructure/llm/openai.ts

import { randomUUID } from 'node:crypto';
import { $fetch } from 'ofetch';
import { createError } from 'h3';
import OpenAI from 'openai';
import type { LlmProviderPort } from '../../ports';
import { config } from '../../config';
import { summaryStore } from '../../utils/summaryStore';
import { responseIdStore } from '../../utils/responseIdStore';
import { readChatSettings } from '../../utils/storage';
import { welcomePromptStore } from '../../utils/welcomePromptStore';
import {
  buildSummaryPrompt,
  buildChatPrelude,
  buildSessionMemoryText,
  buildChatPreludeWithMemory,
  buildWelcomePrompt,
} from '@@/server/application/prompts';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

// In-memory cache for current session encrypted reasoning
const sessionCache = new Map<
  string,
  { encryptedReasoning?: string | null; lastUsedModel?: string }
>();

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
    const apiKey = process.env.NUXT_OPENAI_API_KEY;
    if (!apiKey)
      throw createError({
        statusCode: 500,
        message: 'NUXT_OPENAI_API_KEY is not set',
      });

    const usedModel = model || config.llm.openai.defaultModel;
    const maxTokens =
      options?.maxOutputTokens || config.llm.openai.defaultMaxOutputTokens;

    let attempt = 0;
    const maxRetries = 5;

    const org = process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID;
    const project =
      process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID;
    const idempotencyKey = randomUUID();

    const sessionId: string | undefined = options?.sessionId;
    const cached = sessionId ? sessionCache.get(sessionId) : undefined;
    const encryptedFromCache = cached?.encryptedReasoning ?? null;

    let tryEncrypted =
      ((process.env.NUXT_OPENAI_ENABLE_ENCRYPTED_REASONING ||
        process.env.OPENAI_ENABLE_ENCRYPTED_REASONING) ??
        'false') === 'true';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Получаем настройки пользователя для управления памятью
        const chatSettings = options?.userId
          ? await readChatSettings(String(options.userId))
          : null;
        const enablePreviousResponseId =
          chatSettings?.enablePreviousResponseId ?? true;
        const enableSummary = chatSettings?.enableSummary ?? true;
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
        const hasSummary = enableSummary && options?.userId != null;
        const hasPreviousResponseId =
          enablePreviousResponseId && previousResponseId;

        // Определяем isFirst: это первая сессия только если НЕТ ни summary, ни previous_response_id
        let sessionMemoryText = '';
        let isFirst = Boolean(options?.isFirstSession);

        if (hasSummary && options?.userId != null) {
          try {
            const all = await summaryStore.getSummaries(options.userId, 10); // Лимит последних 10
            if (all && all.length > 0) {
              sessionMemoryText = buildSessionMemoryText(
                all,
                options?.lang ?? 'ru'
                // Не передаем maxSummaryLength - truncation: "auto" обработает превышение контекста
              );
              isFirst = false; // Если есть summary - это не первая сессия
            }
          } catch {}
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
            mode: options?.mode || 'therapy',
          },
          {
            isFirstSession: isFirst,
            sessionMemoryText: sessionMemoryText,
            responseNumber,
            userMessage: lastUserMessage,
          }
        );

        const developerStyle = '';

        // Собираем корректный массив сообщений с валидными типами контента
        const input = [
          {
            role: 'system',
            content: [{ type: 'input_text' as const, text: systemPrelude }],
          },
          {
            role: 'developer',
            content: [{ type: 'input_text' as const, text: developerStyle }],
          },
          // ПАМЯТЬ ПРОШЛЫХ СЕССИЙ → developer-блок до истории сообщений
          ...(!isFirst && sessionMemoryText
            ? [
                {
                  role: 'developer' as const,
                  content: [
                    {
                      type: 'input_text' as const,
                      text: `Справочный контекст прошлых сессий:\n${sessionMemoryText}`,
                    },
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
          ...mapToResponsesInput(messages || []),
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

        const res: any = await $fetch(OPENAI_URL, {
          method: 'POST',
          timeout: 30_000,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(org ? { 'OpenAI-Organization': org } : {}),
            ...(project ? { 'OpenAI-Project': project } : {}),
            'Idempotency-Key': idempotencyKey,
          },
          body,
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
        const status = err?.response?.status || err?.status;
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
    if (!sessionId || !userId) {
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

    const apiKey = process.env.NUXT_OPENAI_API_KEY;
    if (!apiKey)
      throw createError({
        statusCode: 500,
        message: 'NUXT_OPENAI_API_KEY is not set',
      });

    const usedModel = model || config.llm.openai.defaultModel;
    const org = process.env.NUXT_OPENAI_ORG_ID || process.env.OPENAI_ORG_ID;
    const project =
      process.env.NUXT_OPENAI_PROJECT_ID || process.env.OPENAI_PROJECT_ID;
    const idempotencyKey = randomUUID();

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

    try {
      const res: any = await $fetch(OPENAI_URL, {
        method: 'POST',
        timeout: 30_000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(org ? { 'OpenAI-Organization': org } : {}),
          ...(project ? { 'OpenAI-Project': project } : {}),
          'Idempotency-Key': idempotencyKey,
        },
        body,
      });

      const raw = extractText(res);
      const normalized = parseStrictJson(raw);

      await summaryStore.save(userId, sessionId, JSON.stringify(normalized));
    } catch (error) {
      // Сохраняем пустой summary в случае ошибки
      await summaryStore.save(
        userId,
        sessionId,
        JSON.stringify({ summary_text: '' })
      );
    } finally {
      sessionCache.delete(sessionId);
    }
  },

  async *chatStream({ messages, model, options }: any): AsyncIterable<string> {
    const apiKey = process.env.NUXT_OPENAI_API_KEY;
    if (!apiKey)
      throw createError({
        statusCode: 500,
        message: 'NUXT_OPENAI_API_KEY is not set',
      });

    // Получаем настройки пользователя для управления памятью
    const chatSettings = options?.userId
      ? await readChatSettings(String(options.userId))
      : null;
    const enablePreviousResponseId =
      chatSettings?.enablePreviousResponseId ?? true;
    const enableSummary = chatSettings?.enableSummary ?? true;
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

    // Проверяем, является ли это стартом с welcome-экрана (messages пустой и есть mode)
    const isWelcomeStart = (messages?.length || 0) === 0 && options?.mode;

    // Важно: isFirst должен учитывать не только summary, но и previous_response_id
    // Если хотя бы один механизм памяти включен и есть данные - это не первая сессия
    const hasSummary = enableSummary && options?.userId != null;
    const hasPreviousResponseId =
      enablePreviousResponseId && previousResponseId;

    let sessionMemoryText = '';
    let isFirst = Boolean(options?.isFirstSession);

    if (hasSummary && options?.userId != null) {
      try {
        const all = await summaryStore.getSummaries(options.userId, 10); // Лимит последних 10
        if (all && all.length > 0) {
          sessionMemoryText = buildSessionMemoryText(
            all,
            options?.lang ?? 'ru'
          );
          isFirst = false; // Если есть summary - это не первая сессия
        }
      } catch {}
    }

    // Если есть previous_response_id - это точно не первая сессия
    if (hasPreviousResponseId) {
      isFirst = false;
    }

    const lang = options?.lang ?? 'ru';

    // ОБРАБОТКА СТАРТА С WELCOME-ЭКРАНА
    if (isWelcomeStart) {
      // Загружаем welcome-промпт из БД (или используем дефолтный)
      let welcomePromptContent: string | null = null;
      if (options.userId) {
        try {
          welcomePromptContent = await welcomePromptStore.get(
            options.userId,
            options.mode as 'therapy' | 'habits' | 'talk',
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
            options.mode as 'therapy' | 'habits' | 'talk',
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

      // Формируем стартовый промпт
      const welcomePrompt = buildWelcomePrompt({
        mode: options.mode as 'therapy' | 'habits' | 'talk',
        isFirstSession: isFirst,
        sessionMemoryText: sessionMemoryText,
        lang,
        user_locale: options?.user_locale,
        user_name: options?.user_name,
        welcomePromptContent: welcomePromptContent || undefined,
      });

      // System промпт для старта
      // Для welcome-старта responseNumber = 1 (первое сообщение)
      const responseNumber = 1;
      const systemPrelude = buildChatPreludeWithMemory(
        {
          lang,
          user_locale: options?.user_locale,
          user_name: options?.user_name,
          mode: options?.mode || 'therapy',
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
        // НЕ добавляем messages - они пустые для welcome-старта!
      ];

      const openai = new OpenAI({ apiKey });

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

      const stream = await openai.responses.stream(streamOptions);

      let responseId: string | undefined;
      let deltaCount = 0;
      let hasError = false;

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
            hasError = true;
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

    // ОБЫЧНЫЙ РЕЖИМ ДИАЛОГА (messages не пустые или нет mode)
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
        mode: options?.mode || 'therapy',
      },
      {
        isFirstSession: isFirst,
        sessionMemoryText: sessionMemoryText,
        responseNumber,
        userMessage: lastUserMessage,
      }
    );

    const developerStyle = '';

    const input = [
      {
        role: 'system',
        content: [{ type: 'input_text' as const, text: systemPrelude }],
      },
      {
        role: 'developer',
        content: [{ type: 'input_text' as const, text: developerStyle }],
      },
      // ПАМЯТЬ ПРОШЛЫХ СЕССИЙ → developer-блок до истории сообщений
      ...(!isFirst && sessionMemoryText
        ? [
            {
              role: 'developer' as const,
              content: [
                {
                  type: 'input_text' as const,
                  text: `Справочный контекст прошлых сессий:\n${sessionMemoryText}`,
                },
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
      ...mapToResponsesInput(messages || []),
    ];

    // ВАЖНО: Когда используется previous_response_id, OpenAI восстанавливает контекст из предыдущего ответа.
    // Но мы все равно должны передавать ВСЕ сообщения текущей сессии (не только новые).
    // Проблема: после перезагрузки страницы messages содержит только новые сообщения.

    const openai = new OpenAI({ apiKey });

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

    const stream = await openai.responses.stream(streamOptions);

    let responseId: string | undefined;

    for await (const ev of stream as any) {
      if (ev?.type === 'response.output_text.delta' && ev?.delta) {
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
  },
};
