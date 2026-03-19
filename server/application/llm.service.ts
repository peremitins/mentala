import type { LlmProviderPort } from '../ports';
import { openaiProvider } from '../infrastructure/llm/openai';
import { deepseekProvider } from '../infrastructure/llm/deepseek';
import { yandexProvider } from '../infrastructure/llm/yandex';
import { config } from '../config';
import type { ChatEntryContext } from '@/shared/dto';
import type { OnboardingReasons } from '@/shared/dto/onboarding';
import type { Addressing } from '@/shared/dto/notifications';

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
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'developer';
    content: string;
  }>;
  options?: {
    sessionId?: string;
    temperature?: number;
    maxOutputTokens?: number; // Для Responses API
    scenario?: 'chat' | 'notifications' | 'chips'; // Сценарий использования
    lang?: string;
    user_locale?: string;
    user_name?: string;
    user_gender?: string;
    user_timezone?: string;
    addressing?: Addressing;
    toneKey?: string;
    toneLabel?: string;
    toneDescription?: string;
    onboardingReasons?: OnboardingReasons;
    userId?: number | string;
    isFirstSession?: boolean;
    userPrompt?: string;
    entryContext?: ChatEntryContext;
  };
}) {
  const provider = getProvider(params.provider);

  // Если указан scenario, используем настройки из конфига
  let temperature = params.options?.temperature;
  // ВАЖНО: maxOutputTokens из options имеет приоритет - не перезаписываем, если задано явно
  let maxOutputTokens = params.options?.maxOutputTokens;

  if (params.options?.scenario) {
    const scenarioConfig = config.llm.openai.settings[params.options.scenario];
    // Температура: используем из options, если задана, иначе из конфига
    if (!temperature) {
      temperature = scenarioConfig.temperature;
    }
    // maxOutputTokens: НЕ перезаписываем, если уже задано явно в options (для динамических расчетов)
    // Используем из конфига только если не задано в options
    if (!maxOutputTokens) {
      maxOutputTokens = scenarioConfig.maxOutputTokens;
    }
  }

  return provider.chat({
    messages: params.messages,
    model: params.model,
    options: {
      ...params.options,
      temperature,
      maxOutputTokens,
    },
  });
}

function isRetryableStatus(status?: number) {
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
}

export async function chatWithFallback(params: {
  provider?: LlmProviderPort['id'];
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'developer';
    content: string;
  }>;
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

export function chatStreamViaProvider(params: {
  provider?: LlmProviderPort['id'];
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  options?: {
    sessionId?: string;
    temperature?: number;
    maxOutputTokens?: number; // Для Responses API
    scenario?: 'chat' | 'notifications' | 'chips'; // Сценарий использования
    lang?: string;
    user_locale?: string;
    user_name?: string;
    user_gender?: string;
    user_timezone?: string;
    addressing?: Addressing;
    toneKey?: string;
    toneLabel?: string;
    toneDescription?: string;
    onboardingReasons?: OnboardingReasons;
    userId?: number | string;
    isFirstSession?: boolean;
    userPrompt?: string;
    entryContext?: ChatEntryContext;
  };
}): AsyncIterable<string> {
  const provider = getProvider(params.provider);
  if (!provider.chatStream) {
    throw new Error(`Provider ${provider.id} does not support streaming`);
  }

  // Если указан scenario, используем настройки из конфига
  let temperature = params.options?.temperature;
  // ВАЖНО: maxOutputTokens из options имеет приоритет - не перезаписываем, если задано явно
  let maxOutputTokens = params.options?.maxOutputTokens;

  if (params.options?.scenario) {
    const scenarioConfig = config.llm.openai.settings[params.options.scenario];
    // Температура: используем из options, если задана, иначе из конфига
    if (!temperature) {
      temperature = scenarioConfig.temperature;
    }
    // maxOutputTokens: НЕ перезаписываем, если уже задано явно в options (для динамических расчетов)
    // Используем из конфига только если не задано в options
    if (!maxOutputTokens) {
      maxOutputTokens = scenarioConfig.maxOutputTokens;
    }
  }

  return provider.chatStream({
    messages: params.messages,
    model: params.model,
    options: {
      ...params.options,
      temperature,
      maxOutputTokens,
    },
  }) as AsyncIterable<string>;
}
