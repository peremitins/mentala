import { afterEach, describe, expect, it, vi } from 'vitest';

const shareMocks = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
  isPluginAvailableMock: vi.fn(),
  canShareMock: vi.fn(),
  nativeShareMock: vi.fn(),
  copyToClipboardMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => shareMocks.isNativePlatformMock(),
    isPluginAvailable: (pluginName: string) =>
      shareMocks.isPluginAvailableMock(pluginName),
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    canShare: (...args: unknown[]) => shareMocks.canShareMock(...args),
    share: (...args: unknown[]) => shareMocks.nativeShareMock(...args),
  },
}));

vi.mock('@/app/composables/useCopyToClipboard', () => ({
  copyToClipboard: (...args: unknown[]) =>
    shareMocks.copyToClipboardMock(...args),
}));

function setNavigatorMock(
  value?: Partial<Navigator> & {
    share?: (data?: ShareData) => Promise<void>;
    canShare?: (data?: ShareData) => boolean;
  }
) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  shareMocks.isNativePlatformMock.mockReset();
  shareMocks.isPluginAvailableMock.mockReset();
  shareMocks.canShareMock.mockReset();
  shareMocks.nativeShareMock.mockReset();
  shareMocks.copyToClipboardMock.mockReset();
  vi.resetModules();
  setNavigatorMock(undefined);
});

describe('shareContent', () => {
  it('использует нативный share на iOS/Android через Capacitor', async () => {
    shareMocks.isNativePlatformMock.mockReturnValue(true);
    shareMocks.isPluginAvailableMock.mockReturnValue(true);
    shareMocks.canShareMock.mockResolvedValue({ value: true });
    shareMocks.nativeShareMock.mockResolvedValue({ activityType: '' });

    const { shareContent } = await import('../app/composables/useShareContent');

    await expect(
      shareContent({
        title: 'Промокод Mentala',
        text: 'Мой промокод Mentala: TEST123',
        dialogTitle: 'Поделиться промокодом',
        fallbackText: 'Мой промокод Mentala: TEST123',
      })
    ).resolves.toBe('shared');

    expect(shareMocks.nativeShareMock).toHaveBeenCalledWith({
      title: 'Промокод Mentala',
      text: 'Мой промокод Mentala: TEST123',
      url: undefined,
      dialogTitle: 'Поделиться промокодом',
    });
    expect(shareMocks.copyToClipboardMock).not.toHaveBeenCalled();
  });

  it('использует Web Share API на desktop/web, если браузер поддерживает share', async () => {
    const browserShareMock = vi.fn().mockResolvedValue(undefined);

    shareMocks.isNativePlatformMock.mockReturnValue(false);
    setNavigatorMock({
      canShare: vi.fn().mockReturnValue(true),
      share: browserShareMock,
    });

    const { shareContent } = await import('../app/composables/useShareContent');

    await expect(
      shareContent({
        title: 'Промокод Mentala',
        text: 'Мой промокод Mentala: TEST123',
        fallbackText: 'Мой промокод Mentala: TEST123',
      })
    ).resolves.toBe('shared');

    expect(browserShareMock).toHaveBeenCalledWith({
      title: 'Промокод Mentala',
      text: 'Мой промокод Mentala: TEST123',
    });
    expect(shareMocks.copyToClipboardMock).not.toHaveBeenCalled();
  });

  it('не копирует текст, если пользователь сам закрыл share-sheet', async () => {
    shareMocks.isNativePlatformMock.mockReturnValue(false);
    setNavigatorMock({
      canShare: vi.fn().mockReturnValue(true),
      share: vi
        .fn()
        .mockRejectedValue(
          new DOMException('The share was aborted', 'AbortError')
        ),
    });

    const { shareContent } = await import('../app/composables/useShareContent');

    await expect(
      shareContent({
        text: 'Мой промокод Mentala: TEST123',
        fallbackText: 'Мой промокод Mentala: TEST123',
      })
    ).resolves.toBe('cancelled');

    expect(shareMocks.copyToClipboardMock).not.toHaveBeenCalled();
  });

  it('делает copy fallback, если шаринг на устройстве недоступен', async () => {
    shareMocks.isNativePlatformMock.mockReturnValue(false);
    shareMocks.copyToClipboardMock.mockResolvedValue(true);
    setNavigatorMock({
      canShare: vi.fn().mockReturnValue(false),
      share: vi.fn(),
    });

    const { shareContent } = await import('../app/composables/useShareContent');

    await expect(
      shareContent({
        text: 'Мой промокод Mentala: TEST123',
        fallbackText: 'Мой промокод Mentala: TEST123',
      })
    ).resolves.toBe('copied');

    expect(shareMocks.copyToClipboardMock).toHaveBeenCalledWith(
      'Мой промокод Mentala: TEST123'
    );
  });
});
