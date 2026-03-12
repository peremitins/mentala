## Диагноз: да, фото сохраняются локально — это проблема

Текущий `upload-photo.post.ts`:

- Пишет файл в `process.cwd()/public/uploads/gratitude-diary/{userId}/...`
- Возвращает URL вида `/uploads/gratitude-diary/83/1773223016513-xxxx.jpg`
- Это **локальный диск сервера** — файлы не переживут рестарт/редеплой контейнера, не масштабируются, не имеют CDN, занимают место на инстансе

---

## Техническое задание: перевод загрузки фото на Yandex Object Storage

### Контекст и оценка подхода

Подход с Yandex Object Storage — правильный и единственно верный для продакшна. Уже используется для медитаций через bash-скрипты и AWS CLI (S3-совместимый API). Для пользовательских загрузок нужно сделать то же самое, но из серверного TypeScript-кода через `@aws-sdk/client-s3`.

- Бакет: `mentala` (уже существует)
- Endpoint: `https://storage.yandexcloud.net`
- CDN: `https://media.mentala.app`
- Env vars уже готовы: `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` (те же, что используются в bash-скриптах — не добавлять новые)

---

### Архитектурные решения

1. **Загрузка через backend, не напрямую с клиента.** Клиент не получает прямого доступа к Object Storage. Сервер — единственная точка загрузки. Это сознательное решение ради централизованной валидации, авторизации и обработки изображений.

2. **В Object Storage сохраняется нормализованный файл**, а не исходник как есть (EXIF очищен, orientation нормализован, формат стандартизирован).

3. **В базе данных хранится `photoStorageKey`** — путь в бакете, например `user-uploads/gratitude-diary/83/1773223016513-uuid.webp`. Публичный URL собирается динамически как `${CDN_BASE}/${photoStorageKey}`. Это позволяет менять CDN без правки БД и удалять объект по ключу без парсинга URL.

4. **Приватность фото (v1 — осознанный компромисс).** На первом этапе фото хранятся как **unlisted public URLs** — доступны любому, кто знает прямой URL. Это сознательный компромисс ради простоты реализации. Путь `user-uploads/gratitude-diary/{userId}/{timestamp}-{uuid}` делает URL неугадываемым, но не приватным. В будущем возможен переход на приватное хранение и временные подписанные ссылки (presigned URLs), когда основной функционал будет работать.

5. **Публичный доступ к объектам в v1 задаётся не через object ACL, а через конфигурацию бакета и CDN.** Backend не должен полагаться на `ACL: public-read` при загрузке пользовательских файлов. Публичность обеспечивается на уровне bucket policy и/или CDN-конфигурации — это зона инфраструктурной ответственности, а не кода.

---

### Задачи для реализации

**1. Установить зависимости**

```bash
pnpm add @aws-sdk/client-s3 sharp
```

> `sharp` содержит встроенные TypeScript-типы — `@types/sharp` не нужен.

**2. Создать S3-клиент в инфраструктурном слое**

Файл: `server/infrastructure/storage/s3-client.ts`

```typescript
// Singleton S3-клиент для Yandex Object Storage (S3-совместимый API)
// Используем существующие переменные окружения ACCESS_KEY_ID и SECRET_ACCESS_KEY
import { S3Client } from '@aws-sdk/client-s3';

// Конфигурационная проверка при старте — падаем явно, не молча
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
export const CDN_BASE =
  process.env.NUXT_PUBLIC_MEDIA_BASE_URL ?? 'https://media.mentala.app';
```

**3. Создать утилиту нормализации изображений**

Файл: `server/infrastructure/storage/image-processor.ts`

```typescript
// Серверная обработка изображений перед загрузкой в Object Storage
// Очищает EXIF, нормализует ориентацию, конвертирует в WebP
import sharp from 'sharp';

// Разрешённые MIME-типы — SVG намеренно запрещён
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3 МБ
export const MAX_DIMENSION_PX = 4096; // максимальная сторона изображения

export interface ProcessedImage {
  buffer: Buffer;
  contentType: 'image/webp';
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  // Проверка размера выполняется до вызова sharp — тяжёлая обработка не должна
  // запускаться для файлов, не прошедших базовую валидацию
  if (input.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `[ImageProcessor] Файл превышает максимальный размер: ${input.length} байт`
    );
  }

  const image = sharp(input);
  const metadata = await image.metadata();

  // Проверка разрешения
  if (
    (metadata.width && metadata.width > MAX_DIMENSION_PX) ||
    (metadata.height && metadata.height > MAX_DIMENSION_PX)
  ) {
    image.resize(MAX_DIMENSION_PX, MAX_DIMENSION_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const buffer = await image
    .rotate() // нормализация orientation по EXIF перед очисткой
    .withMetadata({ exif: {} }) // удаление EXIF-метаданных из итогового файла
    .webp({ quality: 85 }) // конвертация в WebP
    .toBuffer();

  return { buffer, contentType: 'image/webp' };
}

// Проверка MIME-типа файла по сигнатуре (magic bytes), не доверяя Content-Type клиента.
// v1: поддерживаются только JPEG, PNG, WebP — сознательно ограниченный набор.
// При добавлении новых форматов перейти на специализированную библиотеку (например, file-type).
export function detectMimeType(buffer: Buffer): string | null {
  // Базовая защита: WebP требует минимум 12 байт для проверки сигнатуры
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return 'image/png';
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return 'image/webp';
  return null;
}
```

**4. Создать утилиту работы с хранилищем**

Файл: `server/infrastructure/storage/upload.ts`

```typescript
// Загрузка и удаление объектов в Yandex Object Storage
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET_NAME, CDN_BASE, s3 } from './s3-client';

// Загружает объект в хранилище. URL не возвращает — собирать через buildPublicUrl(key).
// key уже известен до вызова, поэтому функция отвечает только за факт загрузки.
export async function uploadToStorage(params: {
  key: string; // путь в бакете: user-uploads/gratitude-diary/{userId}/{timestamp}-{uuid}.webp
  buffer: Buffer;
  contentType: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
      // Имя уникальное → можно кешировать бессрочно
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

export async function deleteFromStorage(key: string): Promise<void> {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
  } catch (err) {
    // Логируем, но не бросаем — удаление orphan файлов не должно ломать основную операцию
    console.error('[Storage] Ошибка удаления объекта', { key, err });
  }
}

// Собирает публичный URL из storage key
export function buildPublicUrl(storageKey: string): string {
  return `${CDN_BASE}/${storageKey}`;
}
```

**5. Переписать `upload-photo.post.ts`**

Ключевые изменения:

- Удалить весь код с `mkdir` и `writeFile` — запись на локальный диск полностью исключена
- Удалить весь legacy helper-код, который формирует новые локальные пути для `public/uploads/...`
- Новые загрузки **не должны использовать `public/uploads/...` ни в одном месте кода**
- Добавить серверную валидацию: размер файла, MIME-тип по сигнатуре (не по имени), разрешённые форматы
- Нормализовать изображение через `processImage` перед загрузкой
- Сформировать ключ: `user-uploads/gratitude-diary/{userId}/{timestamp}-{uuid}.webp`
- Загрузить нормализованный файл через `uploadToStorage` (функция возвращает `void`)
- **Если запись в БД не сохранилась — немедленно удалить только что загруженный объект** (защита от orphan files)
- Собрать публичный URL через `buildPublicUrl(storageKey)` и вернуть `{ url, storageKey }` — оба значения

Структура ключа: только безопасные ASCII-символы, расширение берётся из реально определённого формата (не из имени клиента), timestamp в UTC milliseconds, UUID v4:

```
user-uploads/gratitude-diary/{userId}/{timestampMs}-{uuidV4}.webp
```

**6. Обновить `[id].patch.ts` и `[id].delete.ts`**

При замене фото порядок операций должен быть **строго таким**:

1. Загрузить новый файл в Object Storage → получить новый `storageKey`
2. Сохранить новый `photoStorageKey` в БД
3. **Только после успешного сохранения** — удалить старый объект по старому `photoStorageKey`

Важно:

- Если удаление старого объекта не удалось — запись в БД **не откатывается**, ошибка только логируется
- Старый объект не должен удаляться до подтверждения записи в БД (защита от потери фото пользователя)
- Не парсить URL для получения ключа — использовать только поле `photoStorageKey`

При удалении записи:

- Если `photoStorageKey != null` — удалить объект из хранилища

**7. Обновить схему БД**

Добавить поле `photoStorageKey: text('photo_storage_key')` в таблицу записей дневника.
Затем выполнить `pnpm db:generate` и `pnpm db:migrate`.

**8. Очистка репозитория**

После деплоя:

- Удалить папку `public/uploads/` из репозитория (файлы уже есть в гите)
- Добавить `public/uploads/` в `.gitignore`

---

### Требования к серверной валидации

Перед любой обработкой файла сервер обязан проверить:

| Проверка                | Требование                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Размер файла            | ≤ 3 МБ — проверяется **первым**, до любой обработки через `sharp` (экономия CPU/памяти, защита от умышленно раздутых файлов)                                |
| MIME-тип                | Определять по сигнатуре файла (magic bytes), **не** по `Content-Type` от клиента и не по расширению                                                         |
| Разрешённые форматы     | `image/jpeg`, `image/png`, `image/webp` (сознательно ограниченный набор для v1; при расширении — перейти на специализированную библиотеку типа `file-type`) |
| SVG                     | Запрещён                                                                                                                                                    |
| Максимальное разрешение | 4096×4096 px (ресайз при превышении)                                                                                                                        |
| Content-Type заголовок  | Не доверять клиенту — выставлять на сервере после определения формата                                                                                       |

Таймауты и лимиты endpoint'а:

- Максимальный размер request body: 5 МБ (с запасом для multipart overhead)
- Один файл на запрос

---

### Требования к обработке изображений (через `sharp`)

Перед загрузкой в Object Storage сервер должен:

1. Проверить сигнатуру файла
2. Нормализовать orientation (по EXIF)
3. **Полностью удалить EXIF-метаданные из итогового файла** (включая геолокацию, информацию об устройстве и т.д.)
4. При необходимости ресайзить до максимум 4096×4096 px (fit: inside, без увеличения)
5. Конвертировать в WebP (quality: 85)
6. Загрузить нормализованный файл в Object Storage

> Конкретный способ удаления EXIF выбирается исходя из версии `sharp` — требование задаёт **поведение** (EXIF отсутствует в результирующем файле), а не привязывает к конкретному вызову API.

---

### Стратегия orphan files

Базовый сценарий (v1):

1. Загружаем файл в Object Storage → получаем `storageKey`
2. Сохраняем запись в БД с `photoStorageKey = storageKey`
3. Если шаг 2 упал — **немедленно пытаемся удалить объект** по `storageKey`
4. Логируем результат попытки удаления

Для диагностики временно сохраняются структурированные логи операций upload/delete с полями:

- `userId`, `storageKey`, `fileSizeBytes`, `contentType`, `error`, `requestId`

В будущем: периодическая фоновая очистка orphan objects (cron job).

---

### Требования к логированию

При каждой операции с хранилищем логировать:

| Событие        | Поля                                                                 |
| -------------- | -------------------------------------------------------------------- |
| Upload success | `userId`, `storageKey`, `fileSizeBytes`, `contentType`, `durationMs` |
| Upload error   | `userId`, `storageKey`, `fileSizeBytes`, `errorCode`, `errorMessage` |
| Delete success | `storageKey`                                                         |
| Delete error   | `storageKey`, `errorCode`, `errorMessage`                            |

Поведение при ошибках:

- `storage недоступен` → вернуть 503, залогировать с деталями
- `upload error` → попытаться удалить частично загруженный объект, вернуть 500
- `delete error` → залогировать, не бросать пользователю (не критично)
- `credentials не настроены` → падение при старте сервера (конфигурационная проверка)

---

### Структура путей в бакете

```
mentala/
├── meditations/          # существующие медитации (bash-скрипты)
├── notifications/        # существующие уведомления (bash-скрипты)
└── user-uploads/
    └── gratitude-diary/
        └── {userId}/
            └── {timestampMs}-{uuidV4}.webp   # нормализованное фото дневника
```

---

### Переменные окружения

Использовать **уже существующие** переменные — те же, что в bash-скриптах:

```
ACCESS_KEY_ID=...          # уже есть
SECRET_ACCESS_KEY=...      # уже есть
STORAGE_BUCKET=mentala     # добавить, если нет явного
```

Не добавлять `YANDEX_STORAGE_ACCESS_KEY_ID` / `YANDEX_STORAGE_SECRET_ACCESS_KEY` — это создаст два набора «почти одинаковых» переменных для одного сервиса.

---

### Риски и нюансы

| Пункт                                                 | Решение                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Существующие записи с локальными URL (`/uploads/...`) | Для новых записей используется только `photoStorageKey`. Старые локальные URL (`/uploads/...`) считаются **legacy-данными**. До релиза необходимо выбрать **один** из вариантов: 1) одноразовая миграция старых файлов в Object Storage, 2) временная поддержка legacy-раздачи локальных файлов, 3) явное обнуление старых ссылок. Оставлять поведение неопределённым нельзя — иначе часть системы работает на storage key, часть на legacy URL, что создаёт неустранимый техдолг. |
| Публичный доступ к фото по прямому URL                | v1 — осознанный компромисс. URL неугадываем (UUID), но не приватен. В будущем — presigned URLs                                                                                                                                                                                                                                                                                                                                                                                     |
| Cold start / latency S3 PUT                           | Незначительно для файлов до 3 МБ — приемлемо                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Multipart requests с лишними полями                   | Парсер обрабатывает только ожидаемые поля, остальное игнорируется                                                                                                                                                                                                                                                                                                                                                                                                                  |
