import { estimateCostUSD } from '@/server/application/llm.service';
import { config } from '@/server/config';

const DEFAULT_CHAT_MODEL =
  config.llm.openai.models.chat || config.llm.openai.defaultModel;

const CHAT_MODEL_ALLOWLIST = Array.from(
  new Set([config.llm.openai.models.chat, config.llm.openai.defaultModel])
).filter(
  (model): model is string => typeof model === 'string' && model.length > 0
);

function estimateInputTokens(
  messages: Array<{ role: string; content: string }>
): number {
  const lastUserMessage =
    messages.filter((message) => message.role === 'user').slice(-1)[0]
      ?.content || '';

  // Добавляем фиксированный "буфер" под системные инструкции/контекст,
  // чтобы бюджетный pre-check был консервативным.
  return Math.ceil(lastUserMessage.length / 4) + 1200;
}

export function resolveAllowedChatModel(requestedModel?: string): string {
  if (!requestedModel) {
    return DEFAULT_CHAT_MODEL;
  }

  const normalized = requestedModel.trim();
  if (CHAT_MODEL_ALLOWLIST.includes(normalized)) {
    return normalized;
  }

  return DEFAULT_CHAT_MODEL;
}

export function estimateChatRequestUpperBoundUSD(params: {
  messages: Array<{ role: string; content: string }>;
  model: string;
}): number {
  const tokensIn = estimateInputTokens(params.messages);
  const tokensOut =
    config.llm.openai.settings.chat.maxOutputTokens ||
    config.llm.openai.defaultMaxOutputTokens;

  return estimateCostUSD({
    provider: 'openai',
    model: params.model,
    tokensIn,
    tokensOut,
  });
}

export function isChatRequestOverBudget(estimatedUsd: number): boolean {
  return estimatedUsd > config.llm.limits.maxRequestUSD;
}
