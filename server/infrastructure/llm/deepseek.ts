import { ofetch } from 'ofetch';
import type { LlmProviderPort } from '../../ports';

const BASE = 'https://api.deepseek.com';

export const deepseekProvider: LlmProviderPort = {
  id: 'deepseek',
  async chat({ messages, model }) {
    const apiKey = process.env.NUXT_DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('NUXT_DEEPSEEK_API_KEY is not set');
    const usedModel = model || 'deepseek-chat';
    const res = await ofetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: { model: usedModel, messages },
    });
    const content = res.choices?.[0]?.message?.content || '';
    return { role: 'assistant', content, model: usedModel };
  },
};
