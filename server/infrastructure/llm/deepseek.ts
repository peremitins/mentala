import { ofetch } from 'ofetch';
import type { LlmProviderPort } from '../../ports';
import { extractOpenAiUsageSnapshot } from '../../utils/openaiUsage';

const BASE = 'https://api.deepseek.com';

function describeMessageChars(messages: Array<{ content?: string }> = []) {
  return messages.reduce(
    (total, message) => total + String(message?.content || '').length,
    0
  );
}

export const deepseekProvider: LlmProviderPort = {
  id: 'deepseek',
  async chat({ messages, model }) {
    const apiKey = process.env.NUXT_DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('NUXT_DEEPSEEK_API_KEY is not set');
    const usedModel = model || 'deepseek-chat';
    const requestStartedAtMs = Date.now();
    console.log('[DeepSeek chat] Отправка запроса:', {
      model: usedModel,
      messagesCount: Array.isArray(messages) ? messages.length : 0,
      inputTextChars: describeMessageChars(messages),
    });
    const res = await ofetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: { model: usedModel, messages },
    });
    const content = res.choices?.[0]?.message?.content || '';
    const usage = extractOpenAiUsageSnapshot(res);

    console.info('[DeepSeek usage]', {
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
