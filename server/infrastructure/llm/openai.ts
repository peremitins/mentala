import { $fetch } from 'ofetch'
import { createError } from 'h3'
import type { LlmProviderPort } from '../../ports'
import { config } from '../../config'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export const openaiProvider: LlmProviderPort = {
  id: 'openai',
  async chat({ messages, model }) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.NUXT_OPENAI_API_KEY
    if (!apiKey) throw createError({ statusCode: 500, message: 'OPENAI_API_KEY is not set' })
    const usedModel = model || config.llm.openai.defaultModel
    console.log('1', process.env.OPENAI_API_KEY)
    let attempt = 0
    const maxRetries = 5
    const maxTokens = config.llm.openai.defaultMaxOutputTokens
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res: any = await $fetch(OPENAI_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: {
            model: usedModel,
            messages,
            max_tokens: maxTokens,
            temperature: 0.3,
          },
        })
        const content = res?.choices?.[0]?.message?.content || ''
        return { role: 'assistant', content, model: usedModel }
      } catch (err: any) {
        const status = err?.response?.status || err?.status
        const headers = err?.response?.headers
        if (status !== 429 || attempt >= maxRetries) {
          throw createError({
            statusCode: status || 500,
            message: `OpenAI error: ${status} ${err?.data?.error?.message ?? err?.message ?? ''}`,
          })
        }
        attempt += 1
        const retryAfter = Number((headers as any)?.get?.('retry-after') ?? 0)
        const backoffMs =
          retryAfter > 0
            ? retryAfter * 1000
            : Math.min(2000 * 2 ** (attempt - 1), 15000) + Math.random() * 500
        await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }
    }
  },
}
