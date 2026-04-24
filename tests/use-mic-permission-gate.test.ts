import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadMicPermissionGateForPlatform(platform: 'ios' | 'android') {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({
    Capacitor: {
      getPlatform: () => platform,
    },
  }));
  vi.doMock('@/app/utils/document', () => ({
    isDocumentAvailable: () => false,
  }));

  return await import('../app/composables/useMicPermissionGate');
}

describe('useMicPermissionGate', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('на iOS показывает кастомную модалку даже после первого отказа speech plugin', async () => {
    const { useMicPermissionGate } =
      await loadMicPermissionGateForPlatform('ios');
    const gate = useMicPermissionGate();

    const error = new Error('Microphone permission denied') as Error & {
      code: string;
    };
    error.code = 'PERMISSION_DENIED_FIRST';

    await expect(gate.handleStartFailure(error)).resolves.toBe(true);
    expect(gate.showMicDeniedModal.value).toBe(true);
  });

  it('на iOS показывает кастомную модалку после отказа WKWebView getUserMedia', async () => {
    const { useMicPermissionGate } =
      await loadMicPermissionGateForPlatform('ios');
    const gate = useMicPermissionGate();

    const error = new Error('The request is not allowed') as Error & {
      name: string;
    };
    error.name = 'NotAllowedError';

    await expect(gate.handleStartFailure(error)).resolves.toBe(true);
    expect(gate.showMicDeniedModal.value).toBe(true);
  });

  it('на iOS показывает кастомную модалку для реального текста ошибки speech plugin', async () => {
    const { useMicPermissionGate } =
      await loadMicPermissionGateForPlatform('ios');
    const gate = useMicPermissionGate();

    const error = new Error('User denied access to microphone');

    await expect(gate.handleStartFailure(error)).resolves.toBe(true);
    expect(gate.showMicDeniedModal.value).toBe(true);
  });

  it('на Android сохраняет текущее поведение без кастомной модалки после первого системного отказа', async () => {
    const { useMicPermissionGate } =
      await loadMicPermissionGateForPlatform('android');
    const gate = useMicPermissionGate();

    const error = new Error('Microphone permission denied') as Error & {
      code: string;
    };
    error.code = 'PERMISSION_DENIED_FIRST';

    await expect(gate.handleStartFailure(error)).resolves.toBe(false);
    expect(gate.showMicDeniedModal.value).toBe(false);
  });
});
