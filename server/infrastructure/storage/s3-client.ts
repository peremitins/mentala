// Singleton S3-клиент для Yandex Object Storage (S3-совместимый API).
// Используем существующие переменные окружения ACCESS_KEY_ID и SECRET_ACCESS_KEY —
// те же, что применяются в bash-скриптах. Новые переменные не добавлялись намеренно.
import { S3Client } from '@aws-sdk/client-s3';

// Конфигурационная проверка при старте — падаем явно, а не молча в рантайме.
if (!process.env.ACCESS_KEY_ID || !process.env.SECRET_ACCESS_KEY) {
  throw new Error(
    '[Storage] ACCESS_KEY_ID и SECRET_ACCESS_KEY обязательны для работы Object Storage'
  );
}
if (!process.env.STORAGE_BUCKET) {
  throw new Error(
    '[Storage] STORAGE_BUCKET обязателен для работы Object Storage'
  );
}

export const s3 = new S3Client({
  region: 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});

export const BUCKET_NAME = process.env.STORAGE_BUCKET;

// CDN_BASE используется для построения публичных URL — переменная позволяет
// сменить CDN-адрес без правки кода и БД.
export const CDN_BASE =
  process.env.NUXT_PUBLIC_MEDIA_BASE_URL ?? 'https://media.mentala.app';
