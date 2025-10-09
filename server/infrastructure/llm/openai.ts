// server/infrastructure/llm/openai.ts

import { randomUUID } from 'node:crypto';
import { $fetch } from 'ofetch';
import { createError } from 'h3';
import type { LlmProviderPort } from '../../ports';
import { config } from '../../config';
import { summaryStore } from '../../utils/summaryStore';
import {
  buildSummaryPrompt,
  buildChatPrelude,
  buildDeveloperStylePrompt,
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
    const apiKey =
      process.env.OPENAI_API_KEY || process.env.NUXT_OPENAI_API_KEY;
    if (!apiKey)
      throw createError({
        statusCode: 500,
        message: 'OPENAI_API_KEY is not set',
      });

    const usedModel = model || config.llm.openai.defaultModel;
    const maxTokens = config.llm.openai.defaultMaxOutputTokens;

    let attempt = 0;
    const maxRetries = 5;

    const org = process.env.OPENAI_ORG_ID;
    const project = process.env.OPENAI_PROJECT_ID;
    const idempotencyKey = randomUUID();

    const sessionId: string | undefined = options?.sessionId;
    const cached = sessionId ? sessionCache.get(sessionId) : undefined;
    const encryptedFromCache = cached?.encryptedReasoning ?? null;

    let tryEncrypted =
      (process.env.OPENAI_ENABLE_ENCRYPTED_REASONING ?? 'false') === 'true';

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const systemPrelude = buildChatPrelude({
          lang: options?.lang ?? 'ru',
          user_locale: options?.user_locale,
          user_name: options?.user_name,
        });
        const developerStyle = buildDeveloperStylePrompt();

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
          ...mapToResponsesInput(messages || []),
        ];

        const body: any = {
          model: usedModel,
          input,
          max_output_tokens: maxTokens,
          temperature: options?.temperature ?? 0.3,
          store: false,
          metadata: { app: 'mentai', feature: 'psych_support' },
          text: {}, // при необходимости можно добавить text.format с json_schema
        };

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

        console.log({ res });
        console.log({ body });

        const content = extractText(res);

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
    if (!sessionId) return;

    const apiKey =
      process.env.OPENAI_API_KEY || process.env.NUXT_OPENAI_API_KEY;
    if (!apiKey)
      throw createError({
        statusCode: 500,
        message: 'OPENAI_API_KEY is not set',
      });

    const usedModel = model || config.llm.openai.defaultModel;
    const org = process.env.OPENAI_ORG_ID;
    const project = process.env.OPENAI_PROJECT_ID;
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
      store: false,
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
    } catch {
      await summaryStore.save(
        userId,
        sessionId,
        JSON.stringify({ summary_text: '' })
      );
    } finally {
      sessionCache.delete(sessionId);
    }
  },
};
