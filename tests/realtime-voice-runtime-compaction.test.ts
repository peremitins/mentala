import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/config/chatMemory', () => ({
  CHAT_MEMORY_SOFT_INPUT_TOKENS: 5_000,
  CHAT_MEMORY_MAX_INPUT_TOKENS: 6_000,
  CHAT_MEMORY_MAX_TURNS_PER_CHAIN: 12,
}));

vi.mock('@/server/config', () => ({
  config: {
    llm: {
      openai: {
        defaultModel: 'gpt-5-mini',
      },
    },
  },
}));

describe('realtime voice runtime compaction', () => {
  it('срабатывает по hard threshold раньше лимита turn-ов', async () => {
    const { resolveRealtimeVoiceRuntimeCompactionReason } = await import(
      '../server/application/realtime/realtime-voice-runtime-compaction'
    );

    expect(
      resolveRealtimeVoiceRuntimeCompactionReason({
        inputTokens: 6_100,
        chainTurnCount: 2,
      })
    ).toBe('hard_threshold');
  });

  it('срабатывает по лимиту turn-ов, если токены ещё ниже soft threshold', async () => {
    const { resolveRealtimeVoiceRuntimeCompactionReason } = await import(
      '../server/application/realtime/realtime-voice-runtime-compaction'
    );

    expect(
      resolveRealtimeVoiceRuntimeCompactionReason({
        inputTokens: 1_200,
        chainTurnCount: 12,
      })
    ).toBe('max_turns');
  });

  it('срабатывает по soft threshold после завершённого realtime turn', async () => {
    const { resolveRealtimeVoiceRuntimeCompactionReason } = await import(
      '../server/application/realtime/realtime-voice-runtime-compaction'
    );

    expect(
      resolveRealtimeVoiceRuntimeCompactionReason({
        inputTokens: 5_000,
        chainTurnCount: 3,
      })
    ).toBe('soft_threshold');
  });

  it('не срабатывает ниже порогов', async () => {
    const { resolveRealtimeVoiceRuntimeCompactionReason } = await import(
      '../server/application/realtime/realtime-voice-runtime-compaction'
    );

    expect(
      resolveRealtimeVoiceRuntimeCompactionReason({
        inputTokens: 4_999,
        chainTurnCount: 11,
      })
    ).toBeNull();
  });

  it('для structured runtime compaction не возвращает realtime-модель', async () => {
    const { resolveRealtimeVoiceRuntimeCompactionModel } = await import(
      '../server/application/realtime/realtime-voice-runtime-compaction'
    );

    expect(
      resolveRealtimeVoiceRuntimeCompactionModel('gpt-realtime-mini')
    ).toBe('gpt-5-mini');
    expect(resolveRealtimeVoiceRuntimeCompactionModel('gpt-4o-mini')).toBe(
      'gpt-4o-mini'
    );
  });
});
