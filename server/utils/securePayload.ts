import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_ENV_NAMES = ['SUMMARY_AES_KEY'];
const SUMMARY_ENCRYPTION_DISABLED_ENV = 'SUMMARY_ENCRYPTION_DISABLED';
const IV_LENGTH = 12;

function readBooleanEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) {
    return defaultValue;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

export function isPayloadEncryptionDisabledForCurrentRuntime(): boolean {
  const requestedDisabled = readBooleanEnv(
    SUMMARY_ENCRYPTION_DISABLED_ENV,
    false
  );
  const isProduction = process.env.NODE_ENV === 'production';

  if (requestedDisabled && isProduction) {
    console.warn(
      `[securePayload] ${SUMMARY_ENCRYPTION_DISABLED_ENV}=true is ignored in production`
    );
    return false;
  }

  return requestedDisabled;
}

function resolveEncryptionKey(): Buffer {
  for (const envName of KEY_ENV_NAMES) {
    const rawValue = process.env[envName];
    if (!rawValue) {
      continue;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
      continue;
    }

    const base64Buffer = Buffer.from(trimmed, 'base64');
    if (base64Buffer.length === 32) {
      return base64Buffer;
    }

    const utf8Buffer = Buffer.from(trimmed, 'utf8');
    if (utf8Buffer.length === 32) {
      return utf8Buffer;
    }
  }

  throw new Error('SUMMARY_AES_KEY must be configured as a stable 32-byte key');
}

export function encryptPayload(plaintext: string): { iv: string; ct: string } {
  if (isPayloadEncryptionDisabledForCurrentRuntime()) {
    return {
      iv: '',
      ct: plaintext,
    };
  }

  const key = resolveEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    iv: Buffer.concat([iv, authTag]).toString('base64'),
    ct: ciphertext.toString('base64'),
  };
}

export function decryptPayload(
  ivWithTagBase64: string,
  ctBase64: string
): string {
  if (!ivWithTagBase64) {
    return ctBase64;
  }

  const key = resolveEncryptionKey();
  const ivAndTag = Buffer.from(ivWithTagBase64, 'base64');
  const iv = ivAndTag.subarray(0, IV_LENGTH);
  const authTag = ivAndTag.subarray(IV_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctBase64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

export function serializeEncryptedJson(value: unknown): {
  iv: string;
  ct: string;
} {
  return encryptPayload(JSON.stringify(value));
}

export function parseEncryptedJson<T>(
  ivWithTagBase64: string,
  ctBase64: string
): T {
  const plaintext = decryptPayload(ivWithTagBase64, ctBase64);
  return JSON.parse(plaintext) as T;
}
