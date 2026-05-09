import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const APP_LOCK_RECORD_VERSION = 1 as const;
export const APP_LOCK_PIN_LENGTH = 4;
export const APP_LOCK_KDF = 'pbkdf2-sha256' as const;
export const APP_LOCK_DEFAULT_ITERATIONS = 210_000;
export const APP_LOCK_SALT_BYTES = 16;

export const APP_LOCK_AFTER_OPTIONS = [0, 60, 300, 900] as const;

export type AppLockKdf = typeof APP_LOCK_KDF;
export type AppLockAfterSeconds = (typeof APP_LOCK_AFTER_OPTIONS)[number];

export type AppLockRecord = {
  version: typeof APP_LOCK_RECORD_VERSION;
  userId: number;
  pinHash: string;
  pinSalt: string;
  kdf: AppLockKdf;
  iterations: number;
  lockAfterSeconds: AppLockAfterSeconds;
  createdAt: number;
  updatedAt: number;
};

type CreateAppLockRecordOptions = {
  now?: number;
  iterations?: number;
  lockAfterSeconds?: AppLockAfterSeconds;
  salt?: Uint8Array;
};

export function normalizePin(value: string): string {
  return value.replace(/\D/g, '').slice(0, APP_LOCK_PIN_LENGTH);
}

export function isCompleteAppLockPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function normalizeAppLockAfterSeconds(
  value: number | null | undefined
): AppLockAfterSeconds {
  return APP_LOCK_AFTER_OPTIONS.includes(value as AppLockAfterSeconds)
    ? (value as AppLockAfterSeconds)
    : 60;
}

export async function createAppLockRecord(
  userId: number,
  pin: string,
  options: CreateAppLockRecordOptions = {}
): Promise<AppLockRecord> {
  assertPin(pin);

  const now = options.now ?? Date.now();
  const salt = options.salt ?? createRandomSalt();
  const iterations = options.iterations ?? APP_LOCK_DEFAULT_ITERATIONS;

  return {
    version: APP_LOCK_RECORD_VERSION,
    userId,
    pinHash: await derivePinHash(pin, salt, iterations),
    pinSalt: bytesToHex(salt),
    kdf: APP_LOCK_KDF,
    iterations,
    lockAfterSeconds: options.lockAfterSeconds ?? 60,
    createdAt: now,
    updatedAt: now,
  };
}

export async function verifyAppLockPin(
  record: AppLockRecord,
  pin: string
): Promise<boolean> {
  if (!isValidAppLockRecord(record) || !isCompleteAppLockPin(pin)) {
    return false;
  }

  const expectedHash = await derivePinHash(
    pin,
    hexToBytes(record.pinSalt),
    record.iterations
  );

  return timingSafeEqualHex(record.pinHash, expectedHash);
}

export function isValidAppLockRecord(value: unknown): value is AppLockRecord {
  const record = value as AppLockRecord | null;
  return (
    Boolean(record) &&
    record?.version === APP_LOCK_RECORD_VERSION &&
    typeof record.userId === 'number' &&
    typeof record.pinHash === 'string' &&
    typeof record.pinSalt === 'string' &&
    record.kdf === APP_LOCK_KDF &&
    typeof record.iterations === 'number' &&
    record.iterations > 0 &&
    APP_LOCK_AFTER_OPTIONS.includes(record.lockAfterSeconds) &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number'
  );
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

async function derivePinHash(
  pin: string,
  salt: Uint8Array,
  iterations: number
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const pinKey = await subtle.importKey(
      'raw',
      toArrayBuffer(new TextEncoder().encode(pin)),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: toArrayBuffer(salt),
        iterations,
      },
      pinKey,
      256
    );

    return bytesToHex(new Uint8Array(bits));
  }

  return bytesToHex(
    await pbkdf2Async(sha256, pin, salt, {
      c: iterations,
      dkLen: 32,
      asyncTick: 4,
    })
  );
}

function createRandomSalt(): Uint8Array {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Crypto.getRandomValues недоступен');
  }

  const salt = new Uint8Array(APP_LOCK_SALT_BYTES);
  cryptoApi.getRandomValues(salt);
  return salt;
}

function assertPin(pin: string): void {
  if (!isCompleteAppLockPin(pin)) {
    throw new Error('Код должен состоять из 4 цифр');
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
