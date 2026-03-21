import { ofetch } from 'ofetch';
import type { LlmProviderPort } from '../../ports';
import { extractOpenAiUsageSnapshot } from '../../utils/openaiUsage';

// Placeholder endpoint; replace with actual YandexGPT endpoint if different
const BASE = 'https://llm.api.cloud.yandex.net/foundationModels/v1';

function describeMessageChars(messages: Array<{ content?: string }> = []) {
  return messages.reduce(
    (total, message) => total + String(message?.content || '').length,
    0
  );
}

export const yandexProvider: LlmProviderPort = {
  id: 'yandex',
  async chat({ messages, model }) {
    const apiKey =
      process.env.NUXT_YANDEX_API_KEY ||
      process.env.YA_API_KEY ||
      process.env.YANDEX_API_KEY;
    if (!apiKey) throw new Error('YANDEX_API_KEY is not set');
    const usedModel = model || 'yandexgpt-lite';
    const requestStartedAtMs = Date.now();
    console.log('[Yandex chat] Отправка запроса:', {
      model: usedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      inputTextChars: describeMessageChars(messages),
    });
    const res = await ofetch(`${BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${apiKey}`,
      },
      body: { modelUri: usedModel, messages },
    });
    const content = res.result?.alternatives?.[0]?.message?.text || '';
    const usage = extractOpenAiUsageSnapshot(res);

    console.info('[Yandex usage]', {
      scope: 'chat',
      model: usedModel,
      latencyMs: Date.now() - requestStartedAtMs,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      inputTextChars: describeMessageChars(messages),
      outputTextChars: String(content).length,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      cachedTokens: usage?.cachedTokens ?? 0,
      reasoningTokens: usage?.reasoningTokens ?? 0,
      usageAvailable: Boolean(usage),
    });
    return { role: 'assistant', content, model: usedModel };
  },
};
