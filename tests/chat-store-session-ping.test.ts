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

describe('chat store therapy session ping', () => {
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

  it('не сбрасывает новую therapy-session, если stale ping старой сессии вернул 404', async () => {
    let rejectPing: ((error: unknown) => void) | null = null;
    apiMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPing = reject;
      })
    );

    const { useChatStore } = await import('../app/stores/chat');
    const chat = useChatStore();
    chat.therapySessionId = 10;

    chat.updateActivity();

    expect(apiMock).toHaveBeenCalledWith(
      '/api/therapy/session/ping',
      expect.objectContaining({
        body: { sessionId: 10 },
        suppressErrorToast: true,
      })
    );

    chat.therapySessionId = 20;
    rejectPing?.({ status: 404 });
    await Promise.resolve();

    expect(chat.therapySessionId).toBe(20);
  });
});
