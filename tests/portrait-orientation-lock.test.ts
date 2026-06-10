import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPortraitOrientationLock() {
  vi.resetModules();
  return await import('../app/composables/usePortraitOrientationLock');
}

describe('usePortraitOrientationLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('запрашивает portrait-lock, если браузер поддерживает Screen Orientation API', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      screen: {
        orientation: { lock },
      },
    });

    const { requestPortraitOrientationLock } =
      await loadPortraitOrientationLock();

    await expect(requestPortraitOrientationLock()).resolves.toBe(true);
    expect(lock).toHaveBeenCalledWith('portrait');
  });

  it('не падает и возвращает false, если lock API недоступен', async () => {
    vi.stubGlobal('window', {
      screen: {
        orientation: {},
      },
    });

    const { requestPortraitOrientationLock } =
      await loadPortraitOrientationLock();

    await expect(requestPortraitOrientationLock()).resolves.toBe(false);
  });

  it('переключает portrait-only fallback-классы на html и body', async () => {
    const html = { classList: { toggle: vi.fn() } };
    const body = { classList: { toggle: vi.fn() } };
    vi.stubGlobal('document', {
      documentElement: html,
      body,
    });

    const { setPortraitOnlyLandscapeFallback } =
      await loadPortraitOrientationLock();

    setPortraitOnlyLandscapeFallback(true);
    setPortraitOnlyLandscapeFallback(false);

    expect(html.classList.toggle).toHaveBeenNthCalledWith(
      1,
      'app-portrait-only-landscape',
      true
    );
    expect(body.classList.toggle).toHaveBeenNthCalledWith(
      1,
      'app-portrait-only-landscape',
      true
    );
    expect(html.classList.toggle).toHaveBeenNthCalledWith(
      2,
      'app-portrait-only-landscape',
      false
    );
    expect(body.classList.toggle).toHaveBeenNthCalledWith(
      2,
      'app-portrait-only-landscape',
      false
    );
  });
});
