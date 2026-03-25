import { parseEncryptedJson } from './securePayload';

type StoredDurableUserMemoryPayload = {
  userId: number;
  memoryIv: string | null | undefined;
  memoryCt: string | null | undefined;
};

export function decodeStoredDurableUserMemoryPayload<T>(
  payload: StoredDurableUserMemoryPayload
): T | null {
  try {
    // В debug/plaintext-режиме encryption layer сохраняет пустой iv и raw JSON в ct.
    // Такой payload валиден и должен читаться так же, как encrypted-версия.
    if (!payload.memoryCt) {
      return null;
    }

    return parseEncryptedJson<T>(
      String(payload.memoryIv || ''),
      payload.memoryCt
    );
  } catch (error) {
    console.error(
      '[durableUserMemoryPayload] Failed to decode durable user memory payload:',
      {
        userId: payload.userId,
        error,
      }
    );
    return null;
  }
}
