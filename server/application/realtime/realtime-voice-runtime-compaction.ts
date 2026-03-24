import {
  CHAT_MEMORY_MAX_INPUT_TOKENS,
  CHAT_MEMORY_MAX_TURNS_PER_CHAIN,
  CHAT_MEMORY_SOFT_INPUT_TOKENS,
} from '@/server/config/chatMemory';
import { config } from '@/server/config';

export type RealtimeVoiceRuntimeCompactionReason =
  | 'soft_threshold'
  | 'hard_threshold'
  | 'max_turns';

export function resolveRealtimeVoiceRuntimeCompactionReason(params: {
  inputTokens: number | null;
  chainTurnCount: number;
}): RealtimeVoiceRuntimeCompactionReason | null {
  const inputTokens =
    typeof params.inputTokens === 'number' &&
    Number.isFinite(params.inputTokens)
      ? params.inputTokens
      : null;

  // В realtime voice безопасная точка compaction наступает сразу после
  // завершения ответа ассистента, поэтому soft-threshold можно применять
  // немедленно, не дожидаясь следующего user request.
  if (
    typeof inputTokens === 'number' &&
    inputTokens >= CHAT_MEMORY_MAX_INPUT_TOKENS
  ) {
    return 'hard_threshold';
  }

  if (params.chainTurnCount >= CHAT_MEMORY_MAX_TURNS_PER_CHAIN) {
    return 'max_turns';
  }

  if (
    typeof inputTokens === 'number' &&
    inputTokens >= CHAT_MEMORY_SOFT_INPUT_TOKENS
  ) {
    return 'soft_threshold';
  }

  return null;
}

export function resolveRealtimeVoiceRuntimeCompactionModel(
  model?: string | null
): string {
  const normalized = String(model || '').trim();
  if (!normalized) {
    return config.llm.openai.defaultModel;
  }

  // Realtime-модели не поддерживают structured output через Responses API,
  // который мы используем для runtime compact-state.
  if (normalized.toLowerCase().includes('realtime')) {
    return config.llm.openai.defaultModel;
  }

  return normalized;
}
