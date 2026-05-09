import { afterEach, describe, expect, it } from 'vitest';
import {
  createAppLockRecord,
  normalizePin,
  timingSafeEqualHex,
  verifyAppLockPin,
} from '../app/utils/appLockCrypto';
import { getAppLockStorageKey } from '../app/utils/appLockStorage';

describe('app lock crypto', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  it('создаёт PBKDF2-record и проверяет PIN без хранения кода', async () => {
    const record = await createAppLockRecord(42, '1234', {
      iterations: 1_000,
      now: 1000,
      salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    });

    expect(record).toMatchObject({
      version: 1,
      userId: 42,
      kdf: 'pbkdf2-sha256',
      iterations: 1_000,
      lockAfterSeconds: 60,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(record.pinSalt).toHaveLength(32);
    expect(record.pinHash).toHaveLength(64);
    expect(record.pinHash).not.toContain('1234');
    await expect(verifyAppLockPin(record, '1234')).resolves.toBe(true);
    await expect(verifyAppLockPin(record, '0000')).resolves.toBe(false);
  });

  it('создаёт и проверяет PIN без SubtleCrypto в native dev-origin', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        ...originalCrypto,
        subtle: undefined,
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
    });

    const record = await createAppLockRecord(42, '1234', {
      iterations: 1_000,
      now: 1000,
      salt: Uint8Array.from({ length: 16 }, (_, index) => index),
    });

    expect(record.pinHash).toHaveLength(64);
    await expect(verifyAppLockPin(record, '1234')).resolves.toBe(true);
    await expect(verifyAppLockPin(record, '0000')).resolves.toBe(false);
  });

  it('нормализует ввод до четырёх цифр', () => {
    expect(normalizePin('1a2 3-456')).toBe('1234');
  });

  it('сравнивает hash fixed-loop без раннего выхода по длине', () => {
    expect(timingSafeEqualHex('abcd', 'abcd')).toBe(true);
    expect(timingSafeEqualHex('abcd', 'abce')).toBe(false);
    expect(timingSafeEqualHex('abcd', 'abc')).toBe(false);
  });
});

describe('app lock storage namespace', () => {
  it('разделяет lock-record по userId', () => {
    expect(getAppLockStorageKey(1)).toBe('mentala.app_lock.v1.user.1');
    expect(getAppLockStorageKey(2)).toBe('mentala.app_lock.v1.user.2');
  });
});
