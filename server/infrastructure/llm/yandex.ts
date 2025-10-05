import { ofetch } from 'ofetch'
import type { LlmProviderPort } from '../../ports'

// Placeholder endpoint; replace with actual YandexGPT endpoint if different
const BASE = 'https://llm.api.cloud.yandex.net/foundationModels/v1'

export const yandexProvider: LlmProviderPort = {
  id: 'yandex',
  async chat({ messages, model }) {
    const apiKey = process.env.YA_API_KEY || process.env.YANDEX_API_KEY
    if (!apiKey) throw new Error('YANDEX_API_KEY is not set')
    const usedModel = model || 'yandexgpt-lite'
    const res = await ofetch(`${BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${apiKey}`,
      },
      body: { modelUri: usedModel, messages },
    })
    const content = res.result?.alternatives?.[0]?.message?.text || ''
    return { role: 'assistant', content, model: usedModel }
  },
}
