import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AppLockRecord } from '../app/utils/appLockCrypto';

const storageMocks = vi.hoisted(() => ({
  loadAppLockRecord: vi.fn(),
  saveAppLockRecord: vi.fn(),
  removeAppLockRecord: vi.fn(),
}));

const cryptoMocks = vi.hoisted(() => ({
  createAppLockRecord: vi.fn(),
  verifyAppLockPin: vi.fn(),
}));

vi.mock('../app/utils/appLockStorage', () => storageMocks);

vi.mock('../app/utils/appLockCrypto', async () => {
  const actual = await vi.importActual<
    typeof import('../app/utils/appLockCrypto')
  >('../app/utils/appLockCrypto');

  return {
    ...actual,
    createAppLockRecord: cryptoMocks.createAppLockRecord,
    verifyAppLockPin: cryptoMocks.verifyAppLockPin,
  };
});

function appLockRecord(userId = 1): AppLockRecord {
  return {
    version: 1,
    userId,
    pinHash: 'a'.repeat(64),
    pinSalt: 'b'.repeat(32),
    kdf: 'pbkdf2-sha256',
    iterations: 1_000,
    lockAfterSeconds: 60,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  storageMocks.loadAppLockRecord.mockReset();
  storageMocks.saveAppLockRecord.mockReset();
  storageMocks.removeAppLockRecord.mockReset();
  cryptoMocks.createAppLockRecord.mockReset();
  cryptoMocks.verifyAppLockPin.mockReset();
});

describe('app lock store', () => {
  it('требует setup, если у авторизованного пользователя нет локального record', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(null);

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();

    await store.initializeForUser(42);

    expect(storageMocks.loadAppLockRecord).toHaveBeenCalledWith(42);
    expect(store.initialized).toBe(true);
    expect(store.activeUserId).toBe(42);
    expect(store.setupRequired).toBe(true);
    expect(store.setupMode).toBe('create');
    expect(store.canShowPrivateContent).toBe(false);
  });

  it('не блокирует setup, если native biometric availability зависла', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(null);

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    const refreshSpy = vi
      .spyOn(store, 'refreshBiometricAvailability')
      .mockImplementation(() => new Promise<void>(() => {}));

    await expect(store.initializeForUser(42)).resolves.toBeUndefined();

    expect(refreshSpy).toHaveBeenCalled();
    expect(store.initialized).toBe(true);
    expect(store.setupRequired).toBe(true);
    expect(store.setupMode).toBe('create');
  });

  it('не блокирует lock screen, если native biometric availability зависла', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    const refreshSpy = vi
      .spyOn(store, 'refreshBiometricAvailability')
      .mockImplementation(() => new Promise<void>(() => {}));

    await expect(store.initializeForUser(7)).resolves.toBeUndefined();

    expect(refreshSpy).toHaveBeenCalled();
    expect(store.initialized).toBe(true);
    expect(store.setupRequired).toBe(false);
    expect(store.isLocked).toBe(true);
  });

  it('блокирует приложение при найденном record', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();

    await store.initializeForUser(7);

    expect(store.setupRequired).toBe(false);
    expect(store.isLocked).toBe(true);
    expect(store.canShowPrivateContent).toBe(false);
  });

  it('не запускает биометрию автоматически при найденном record', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    const refreshSpy = vi
      .spyOn(store, 'refreshBiometricAvailability')
      .mockResolvedValue();
    const biometricSpy = vi
      .spyOn(store, 'attemptBiometricUnlock')
      .mockResolvedValue(false);

    await store.initializeForUser(7);

    expect(refreshSpy).toHaveBeenCalled();
    expect(biometricSpy).not.toHaveBeenCalled();
    expect(store.isLocked).toBe(true);
  });

  it('не запускает биометрию автоматически при возврате из background', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    vi.spyOn(store, 'refreshBiometricAvailability').mockResolvedValue();
    await store.initializeForUser(7);
    store.unlock();

    const biometricSpy = vi
      .spyOn(store, 'attemptBiometricUnlock')
      .mockResolvedValue(false);
    store.backgroundedAt = Date.now() - 61_000;
    store.handleAppVisible();

    expect(store.isLocked).toBe(true);
    expect(biometricSpy).not.toHaveBeenCalled();
  });

  it('игнорирует stale initialize, если runtime очищен во время загрузки record', async () => {
    let resolveLoad: (record: AppLockRecord) => void = () => {};
    storageMocks.loadAppLockRecord.mockReturnValue(
      new Promise<AppLockRecord>((resolve) => {
        resolveLoad = resolve;
      })
    );

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    const initialization = store.initializeForUser(7);

    expect(store.activeUserId).toBe(7);
    store.clearRuntime();
    resolveLoad(appLockRecord(7));
    await initialization;

    expect(store.activeUserId).toBe(null);
    expect(store.initialized).toBe(false);
    expect(store.isLocked).toBe(false);
    expect(store.shouldShowGate).toBe(false);
  });

  it('разблокирует приложение после корректного PIN', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));
    cryptoMocks.verifyAppLockPin.mockResolvedValue(true);

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    await store.initializeForUser(7);

    await expect(store.unlockWithPin('1234')).resolves.toBe(true);

    expect(cryptoMocks.verifyAppLockPin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      '1234'
    );
    expect(store.isLocked).toBe(false);
    expect(store.canShowPrivateContent).toBe(true);
  });

  it('сохраняет новый код и снимает mandatory setup', async () => {
    const createdRecord = appLockRecord(7);
    storageMocks.loadAppLockRecord.mockResolvedValue(null);
    cryptoMocks.createAppLockRecord.mockResolvedValue(createdRecord);

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    await store.initializeForUser(7);

    await expect(store.createOrReplacePin('1234')).resolves.toBe(true);

    expect(storageMocks.saveAppLockRecord).toHaveBeenCalledWith(createdRecord);
    expect(store.setupRequired).toBe(false);
    expect(store.setupMode).toBe(null);
    expect(store.canShowPrivateContent).toBe(true);
  });

  it('обновляет lockAfterSeconds без варианта "никогда"', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    await store.initializeForUser(7);
    await store.setLockAfterSeconds(300);

    expect(storageMocks.saveAppLockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        lockAfterSeconds: 300,
      })
    );
    expect(store.lockAfterSeconds).toBe(300);
  });

  it('не переносит lock-состояние при смене пользователя', async () => {
    storageMocks.loadAppLockRecord
      .mockResolvedValueOnce(appLockRecord(7))
      .mockResolvedValueOnce(null);

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    await store.initializeForUser(7);
    await store.initializeForUser(8);

    expect(storageMocks.loadAppLockRecord).toHaveBeenLastCalledWith(8);
    expect(store.activeUserId).toBe(8);
    expect(store.record).toBe(null);
    expect(store.setupRequired).toBe(true);
    expect(storageMocks.removeAppLockRecord).not.toHaveBeenCalled();
  });

  it('очищает runtime без удаления локального record при обычном logout', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    await store.initializeForUser(7);
    store.clearRuntime();

    expect(storageMocks.removeAppLockRecord).not.toHaveBeenCalled();
    expect(store.activeUserId).toBe(null);
    expect(store.record).toBe(null);
  });

  it('удаляет локальный record только при явном локальном сбросе', async () => {
    storageMocks.loadAppLockRecord.mockResolvedValue(appLockRecord(7));

    const { useAppLockStore } = await import('../app/stores/appLock');
    const store = useAppLockStore();
    await store.initializeForUser(7);
    await store.removeLocalRecord();

    expect(storageMocks.removeAppLockRecord).toHaveBeenCalledWith(7);
    expect(store.activeUserId).toBe(null);
    expect(store.record).toBe(null);
  });
});
