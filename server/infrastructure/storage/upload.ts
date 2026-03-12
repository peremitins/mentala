// Загрузка и удаление объектов в Yandex Object Storage.
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET_NAME, CDN_BASE, s3 } from './s3-client';

// Загружает объект в хранилище.
// Возвращает void — ключ задаётся вызывающим кодом до вызова.
// Публичный URL строится отдельно через buildPublicUrl(key).
export async function uploadToStorage(params: {
  key: string; // путь в бакете: user-uploads/gratitude-diary/{userId}/{timestamp}-{uuid}.webp
  buffer: Buffer;
  contentType: string;
  // для структурированного логирования
  userId: number;
}): Promise<void> {
  const startMs = Date.now();

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.contentType,
        // Ключ уникален (timestamp + UUID) → кешируем бессрочно
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    console.info('[Storage] upload success', {
      userId: params.userId,
      storageKey: params.key,
      fileSizeBytes: params.buffer.length,
      contentType: params.contentType,
      durationMs: Date.now() - startMs,
    });
  } catch (err) {
    const error = err as Error & { $metadata?: { httpStatusCode?: number } };
    console.error('[Storage] upload error', {
      userId: params.userId,
      storageKey: params.key,
      fileSizeBytes: params.buffer.length,
      errorCode: error.$metadata?.httpStatusCode,
      errorMessage: error.message,
    });
    throw err;
  }
}

// Удаляет объект из хранилища.
// Ошибка не пробрасывается — удаление orphan-файлов не должно ломать основную операцию.
export async function deleteFromStorage(key: string): Promise<void> {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    );

    console.info('[Storage] delete success', { storageKey: key });
  } catch (err) {
    const error = err as Error & { $metadata?: { httpStatusCode?: number } };
    console.error('[Storage] delete error', {
      storageKey: key,
      errorCode: error.$metadata?.httpStatusCode,
      errorMessage: error.message,
    });
  }
}

// Строит публичный URL из storage key.
// Хранить в БД нужно только key — URL собирается динамически,
// что позволяет менять CDN без правки данных.
export function buildPublicUrl(storageKey: string): string {
  return `${CDN_BASE}/${storageKey}`;
}
