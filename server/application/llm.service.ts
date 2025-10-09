import type { LlmProviderPort } from '../ports';
import { openaiProvider } from '../infrastructure/llm/openai';
import { deepseekProvider } from '../infrastructure/llm/deepseek';
import { yandexProvider } from '../infrastructure/llm/yandex';
import { config } from '../config';

const providers: Record<LlmProviderPort['id'], LlmProviderPort> = {
  openai: openaiProvider,
  deepseek: deepseekProvider,
  yandex: yandexProvider,
};

export function getProvider(id?: LlmProviderPort['id']): LlmProviderPort {
  if (!id) return providers.openai;
  return providers[id] || providers.openai;
}

export async function chatViaProvider(params: {
  provider?: LlmProviderPort['id'];
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  options?: { sessionId?: string; temperature?: number };
}) {
  const provider = getProvider(params.provider);
  return provider.chat({
    messages: params.messages,
    model: params.model,
    options: params.options,
  });
}

function isRetryableStatus(status?: number) {
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
}

export async function chatWithFallback(params: {
  provider?: LlmProviderPort['id'];
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}): Promise<{
  content: string;
  model?: string;
  provider: LlmProviderPort['id'];
}> {
  const order: LlmProviderPort['id'][] = Array.from(
    new Set([params.provider || 'openai', 'deepseek', 'yandex'])
  ) as LlmProviderPort['id'][];
  let lastError: any;
  for (const providerId of order) {
    const provider = getProvider(providerId);
    try {
      const result = await provider.chat({
        messages: params.messages,
        model: params.model,
      });
      return {
        content: result.content,
        model: result.model,
        provider: providerId,
      };
    } catch (e: any) {
      lastError = e;
      const status = e?.status || e?.response?.status;
      if (!isRetryableStatus(status)) break;
      // try next provider
      continue;
    }
  }
  throw lastError || new Error('All providers failed');
}

export function estimateCostUSD(params: {
  provider: 'openai';
  model: string;
  tokensIn: number;
  tokensOut: number;
}): number {
  const map = config.llm.openai.pricingUSDPerMTok as Record<
    string,
    { in: number; out: number }
  >;
  const prices = map[params.model] || map['gpt-4o-mini'];
  const costIn = (params.tokensIn / 1_000_000) * prices.in;
  const costOut = (params.tokensOut / 1_000_000) * prices.out;
  return Number((costIn + costOut).toFixed(6));
}
