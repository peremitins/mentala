import { describe, expect, it } from 'vitest';
import { decodeStoredDurableUserMemoryPayload } from '../server/utils/durableUserMemoryPayload';

describe('durable user memory payload', () => {
  it('читает plaintext payload с пустым iv', () => {
    const decoded = decodeStoredDurableUserMemoryPayload<{
      schemaVersion: number;
      name: string;
      facts: string[];
      preferences: string[];
      context: string[];
    }>({
      userId: 42,
      memoryIv: '',
      memoryCt: JSON.stringify({
        schemaVersion: 1,
        name: 'Николай',
        facts: ['любимый цвет: белый'],
        preferences: ['предпочитает короткие ответы'],
        context: ['строит приложение'],
      }),
    });

    expect(decoded).toEqual({
      schemaVersion: 1,
      name: 'Николай',
      facts: ['любимый цвет: белый'],
      preferences: ['предпочитает короткие ответы'],
      context: ['строит приложение'],
    });
  });

  it('возвращает null, если ciphertext пустой', () => {
    const decoded = decodeStoredDurableUserMemoryPayload({
      userId: 42,
      memoryIv: '',
      memoryCt: '',
    });

    expect(decoded).toBeNull();
  });
});
