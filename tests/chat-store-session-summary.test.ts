import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();

vi.mock('@/app/stores/loaders', () => ({
  useLoadersStore: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock('@/app/utils/csrf', () => ({
  getCsrfTokenForHeader: () => null,
}));

vi.mock('@/app/utils/persistentStorage', () => ({
  getPersistentItem: vi.fn().mockResolvedValue(null),
  removePersistentItem: vi.fn().mockResolvedValue(undefined),
  setPersistentItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/constants/chat', () => ({
  CHAT_STREAM_MODE: true,
}));

vi.mock('@/shared/dto', () => ({
  ChatModeHandoffResponseDto: {
    parse: (value: unknown) => value,
  },
  ChatResponseDto: {
    safeParse: () => ({ success: false }),
  },
  ChatStreamChunkDto: {
    safeParse: () => ({ success: false }),
  },
}));

vi.mock('@/shared/dto/therapySessionRestore', () => ({
  GetRestorableTherapySessionResponseDto: {
    parse: (value: unknown) => value,
  },
}));

vi.mock('nuxt/app', () => ({
  useRuntimeConfig: () => ({
    public: {
      chatIdleTimeoutMs: 60_000,
    },
  }),
}));

describe('chat store session summary finalization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    apiMock.mockReset();
    setActivePinia(createPinia());
    vi.stubGlobal('useNuxtApp', () => ({
      $api: apiMock,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('сохраняет текущий чат, если ручной итог ещё не eligible', async () => {
    const { useChatStore } = await import('../app/stores/chat');
    const chat = useChatStore();

    chat.sessionId = 'client-session-1';
    chat.therapySessionId = 101;
    chat.historyAnchorTherapySessionId = 101;
    chat.sessionStartedAt = new Date('2026-05-20T10:00:00.000Z');
    chat.lastActivityAt = new Date('2026-05-20T10:00:10.000Z');
    chat.messages = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Привет',
        therapySessionId: 101,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Привет. Что хочешь обсудить?',
        therapySessionId: 101,
      },
    ];

    const result = await chat.endSessionAndSummarize({ trigger: 'manual' });

    expect(result).toEqual({ eligible: false, triggered: false });
    expect(apiMock).not.toHaveBeenCalled();
    expect(chat.messages).toHaveLength(2);
    expect(chat.sessionId).toBe('client-session-1');
    expect(chat.therapySessionId).toBe(101);
    expect(chat.historyAnchorTherapySessionId).toBe(101);
  });

  it('сохраняет текущий чат, если сервер отказал в ручном итоге', async () => {
    apiMock.mockResolvedValue({ eligible: false });

    const { useChatStore } = await import('../app/stores/chat');
    const chat = useChatStore();

    chat.sessionId = 'client-session-2';
    chat.therapySessionId = 202;
    chat.historyAnchorTherapySessionId = 202;
    chat.sessionStartedAt = new Date('2026-05-20T10:00:00.000Z');
    chat.lastActivityAt = new Date('2026-05-20T10:04:30.000Z');
    chat.messages = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Хочу подвести итог короткого диалога',
        therapySessionId: 202,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Пока данных может быть мало.',
        therapySessionId: 202,
      },
    ];

    const result = await chat.endSessionAndSummarize({
      trigger: 'manual',
      eligibilityOverride: true,
    });

    expect(result).toEqual({ eligible: true, triggered: false });
    expect(apiMock).toHaveBeenCalledWith(
      '/api/session-summaries-user',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(chat.messages).toHaveLength(2);
    expect(chat.sessionId).toBe('client-session-2');
    expect(chat.therapySessionId).toBe(202);
    expect(chat.historyAnchorTherapySessionId).toBe(202);
  });
});
