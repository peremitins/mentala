# ТЗ: Добавление изображений в push-уведомления

## Статус: 📋 Готово к реализации

---

## 🎯 Цель

Добавить поддержку изображений в push-уведомления для улучшения визуального восприятия и вовлечённости пользователей. Изображения должны автоматически подбираться на основе темы уведомления (привычка или терапия).

---

## 📋 Требования

### 1. Хранение изображений

#### 1.1. Выбор хранилища

**Вариант A: Cloudflare R2 (рекомендуется)**

- ✅ Уже упомянуто в ТЗ бэкенда как хранилище для медиа
- ✅ S3-совместимое API
- ✅ CDN встроен
- ✅ Низкая стоимость
- ✅ Глобальная доступность

**Вариант B: Public папка (для MVP)**

- ⚠️ Проще для начала
- ⚠️ Ограничено размером репозитория
- ⚠️ Нет CDN
- ⚠️ Не масштабируется

**Решение:** Начать с **Варианта A (R2)** для production-ready решения.

#### 1.2. Структура хранения в R2

```
r2-bucket/
└── notifications/
    ├── habits/
    │   ├── water.png
    │   ├── sleep.png
    │   ├── steps.png
    │   ├── meditation.png
    │   ├── nutrition.png
    │   ├── focus_start.png
    │   ├── gratitude.png
    │   ├── morning_routine.png
    │   ├── planning.png
    │   ├── smoking.png
    │   ├── alcohol.png
    │   ├── sugar.png
    │   ├── procrastination.png
    │   ├── screentime.png
    │   └── caffeine.png
    └── therapy/
        ├── anxiety.png
        ├── stress.png
        ├── mood.png
        ├── sleep.png
        ├── anger.png
        ├── selfesteem.png
        ├── focus.png
        ├── relations.png
        ├── grief.png
        ├── loneliness.png
        ├── perfectionism.png
        └── sos.png
```

**URL формат:**

- Production: `https://cdn.mentala.app/notifications/{kind}/{entityKey}.png`
- Development: `https://{bucket-name}.r2.cloudflarestorage.com/notifications/{kind}/{entityKey}.png`

#### 1.3. Формат и размеры изображений

**Технические требования:**

- **Формат:** PNG (с прозрачностью) или WebP (лучшая компрессия)
- **Размер:** 1200x600px (соотношение 2:1)
- **Вес:** < 200KB (оптимизировано)
- **Цветовое пространство:** sRGB
- **Прозрачность:** Опционально (для iOS лучше без прозрачности)

**Рекомендации по дизайну:**

- Минималистичный стиль
- Соответствие теме (emoji из каталога как основа)
- Контрастные цвета для читаемости текста поверх изображения
- Брендовые цвета Mentala

---

### 2. Логика генерации уведомлений с изображениями

#### 2.1. Определение наличия изображения

**Правила:**

1. **Для каталогных тем (habits/therapy):**

   - Изображение берётся из R2 по ключу: `notifications/{kind}/{entityKey}.png`
   - Если файл отсутствует → уведомление без изображения (fallback)

2. **Для кастомных тем:**

   - По умолчанию без изображения
   - В будущем: возможность загрузки пользовательского изображения

3. **Глобальный флаг включения/выключения:**
   - Добавить настройку в `user_preferences`: `notificationImagesEnabled: boolean` (по умолчанию `true`)

#### 2.2. Интеграция с каталогами

**Файлы:**

- `app/lib/habitsCatalog.ts` — каталог привычек
- `app/lib/therapyCatalog.ts` — каталог тем терапии

**Логика:**

```typescript
// Псевдокод
function getNotificationImage(
  kind: 'therapy' | 'habits',
  entityKey: string | null
): string | null {
  // 1. Проверяем глобальную настройку пользователя
  if (!userPreferences.notificationImagesEnabled) {
    return null;
  }

  // 2. Проверяем, что это каталогная тема
  if (!entityKey) {
    return null; // Кастомная тема без изображения
  }

  // 3. Проверяем существование в каталоге
  const existsInCatalog =
    (kind === 'habits' &&
      HABITS_CATALOG.find((h) => h.habitKey === entityKey)) ||
    (kind === 'therapy' && THERAPY_TOPICS.find((t) => t.key === entityKey));

  if (!existsInCatalog) {
    return null; // Не каталогная тема
  }

  // 4. Формируем URL изображения
  const baseUrl = process.env.NUXT_CDN_BASE_URL || 'https://cdn.mentala.app';
  return `${baseUrl}/notifications/${kind}/${entityKey}.png`;
}
```

#### 2.3. Место добавления в код

**Файл:** `server/application/notifications/global-orchestration.service.ts`

**Место:** При создании `NotificationPayload` (строка ~1546)

```typescript
// Текущий код:
const payload: NotificationPayload = {
  title: topicDisplayName ? `Mentala: ${topicDisplayName}` : 'Mentala: время паузы',
  body: text,
  templateId: templateIdForSlot,
  action: 'open',
  deepLink: source.kind === 'therapy' ? '/support' : '/habits',
  data: { ... },
};

// Добавить:
const imageUrl = getNotificationImage(
  source.kind,
  source.normalizedEntityKey ?? null,
  userId // для проверки userPreferences
);

const payload: NotificationPayload = {
  title: topicDisplayName ? `Mentala: ${topicDisplayName}` : 'Mentala: время паузы',
  body: text,
  image: imageUrl || undefined, // Добавляем изображение
  templateId: templateIdForSlot,
  action: 'open',
  deepLink: source.kind === 'therapy' ? '/support' : '/habits',
  data: { ... },
};
```

---

### 3. Настройки пользователя

#### 3.1. Добавление поля в схему БД

**Таблица:** `user_preferences`

**Миграция:**

```sql
ALTER TABLE user_preferences
  ADD COLUMN notification_images_enabled BOOLEAN DEFAULT true NOT NULL;
```

**Drizzle schema:**

```typescript
// server/infrastructure/db/schema.ts
export const userPreferences = pgTable('user_preferences', {
  // ... существующие поля
  notificationImagesEnabled: boolean('notification_images_enabled')
    .default(true)
    .notNull(),
});
```

#### 3.2. DTO обновление

**Файл:** `shared/dto/notifications.ts`

```typescript
export interface UserPreferencesDto {
  addressing: Addressing;
  tone: Tone;
  notificationImagesEnabled?: boolean; // Добавить
}
```

#### 3.3. API для управления настройкой

**Эндпоинт:** `PATCH /api/user/preferences`

**Тело запроса:**

```typescript
{
  notificationImagesEnabled?: boolean;
}
```

**Логика:**

- Обновляет `user_preferences.notification_images_enabled`
- При изменении регенерирует слоты уведомлений (если нужно)

---

### 4. Проверка существования изображений

#### 4.1. Валидация перед отправкой

**Проблема:** Если изображение отсутствует в R2, уведомление не должно падать.

**Решение:**

1. **При генерации слотов:**

   - Проверяем существование изображения в R2 (HEAD запрос)
   - Если отсутствует → `image: undefined` в payload
   - Логируем предупреждение (не ошибку)

2. **При отправке уведомления:**
   - Если `payload.image` есть → используем
   - Если нет → отправляем без изображения (текущая логика уже поддерживает)

#### 4.2. Кеширование результатов проверки

**Проблема:** HEAD запросы к R2 на каждое уведомление → медленно.

**Решение:**

- Кешировать результаты проверки в Redis
- TTL: 24 часа
- Ключ: `notification_image_exists:{kind}:{entityKey}`

**Псевдокод:**

```typescript
async function checkImageExists(
  kind: string,
  entityKey: string
): Promise<boolean> {
  const cacheKey = `notification_image_exists:${kind}:${entityKey}`;

  // Проверяем кеш
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return cached === 'true';
  }

  // Проверяем в R2
  const imageUrl = getImageUrl(kind, entityKey);
  const exists = await checkR2FileExists(imageUrl);

  // Кешируем на 24 часа
  await redis.setex(cacheKey, 86400, exists ? 'true' : 'false');

  return exists;
}
```

---

### 5. Инфраструктура R2

#### 5.1. Настройка R2 bucket

**Требования:**

- Bucket name: `mentala-notifications` (или из env)
- Public access: только для чтения (через CDN)
- CORS: разрешить запросы с доменов приложения

**Переменные окружения:**

```env
# R2 Configuration
NUXT_R2_ACCOUNT_ID=...
NUXT_R2_ACCESS_KEY_ID=...
NUXT_R2_SECRET_ACCESS_KEY=...
NUXT_R2_BUCKET_NAME=mentala-notifications
NUXT_CDN_BASE_URL=https://cdn.mentala.app
```

#### 5.2. Загрузка изображений

**Процесс:**

1. Дизайнер создаёт изображения по макетам
2. Оптимизация (сжатие, WebP конвертация)
3. Загрузка в R2 через CLI или админ-панель

**Инструменты:**

- `wrangler` (Cloudflare CLI) для загрузки
- Или S3-совместимый клиент (`@aws-sdk/client-s3`)

**Скрипт загрузки:**

```typescript
// scripts/upload-notification-images.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.NUXT_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NUXT_R2_SECRET_ACCESS_KEY!,
  },
});

async function uploadImage(kind: string, entityKey: string, imagePath: string) {
  const key = `notifications/${kind}/${entityKey}.png`;
  const fileContent = await readFile(imagePath);

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.NUXT_R2_BUCKET_NAME!,
      Key: key,
      Body: fileContent,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000', // 1 год
    })
  );
}
```

---

### 6. Платформенная поддержка

#### 6.1. Android

**Текущая реализация:** ✅ Уже поддерживается (строки 225-228 в `delivery.service.ts`)

```typescript
if (payload.image) {
  androidNotification.imageUrl = payload.image;
}
```

**Требования:**

- Android 7.0+ (API level 24+)
- Минимальный размер: 512x256px
- Рекомендуемый: 1200x600px

#### 6.2. iOS

**Текущая реализация:** ✅ Уже поддерживается (строки 256-259 в `delivery.service.ts`)

```typescript
...(payload.image && {
  fcm_options: {
    image: payload.image,
  },
}),
```

**Требования:**

- iOS 10+
- Формат: PNG или JPEG (WebP не поддерживается нативно)
- Рекомендуемый размер: 1038x1038px (квадрат) или 1200x600px

#### 6.3. Web (PWA)

**Текущая реализация:** ⚠️ Частично поддерживается через базовый `notificationPayload.imageUrl`

**Требования:**

- Service Worker должен поддерживать изображения
- Формат: любой (WebP предпочтительно)
- Размер: любой (браузер масштабирует)

---

### 7. Fallback и обработка ошибок

#### 7.1. Сценарии fallback

1. **Изображение отсутствует в R2:**

   - Уведомление отправляется без изображения
   - Логируется предупреждение (не ошибка)

2. **Ошибка загрузки изображения:**

   - Уведомление отправляется без изображения
   - Логируется ошибка

3. **Неподдерживаемая платформа:**
   - Уведомление отправляется без изображения
   - Автоматически определяется по `platform` в `user_devices`

#### 7.2. Логирование

**Уровни:**

- **INFO:** Изображение успешно добавлено к уведомлению
- **WARN:** Изображение отсутствует, отправляем без него
- **ERROR:** Ошибка при проверке/загрузке изображения

**Формат логов:**

```typescript
logger.info({
  event: 'notification_image_added',
  userId,
  kind,
  entityKey,
  imageUrl,
});

logger.warn({
  event: 'notification_image_missing',
  userId,
  kind,
  entityKey,
  reason: 'not_found_in_r2',
});
```

---

### 8. Тестирование

#### 8.1. Юнит-тесты

**Функции для тестирования:**

- `getNotificationImage()` — выбор изображения
- `checkImageExists()` — проверка существования
- Логика добавления `image` в payload

#### 8.2. Интеграционные тесты

**Сценарии:**

1. Генерация уведомления с изображением (каталогная тема)
2. Генерация уведомления без изображения (кастомная тема)
3. Генерация уведомления при отключённых изображениях в настройках
4. Отправка уведомления с изображением на Android
5. Отправка уведомления с изображением на iOS
6. Fallback при отсутствии изображения в R2

#### 8.3. E2E тесты

**Сценарии:**

1. Пользователь получает уведомление с изображением
2. Пользователь отключает изображения в настройках → новые уведомления без изображений
3. Пользователь включает изображения → новые уведомления с изображениями

---

### 9. Производительность

#### 9.1. Оптимизация

1. **Кеширование проверок существования:**

   - Redis кеш на 24 часа
   - Снижает количество HEAD запросов к R2

2. **CDN:**

   - Cloudflare R2 автоматически работает через CDN
   - Кеширование на стороне CDN (Cache-Control заголовки)

3. **Ленивая загрузка:**
   - Проверка существования только при генерации слотов
   - Не проверяем при каждой отправке

#### 9.2. Мониторинг

**Метрики:**

- Процент уведомлений с изображениями
- Время проверки существования изображения
- Количество ошибок загрузки изображений
- Размер изображений в байтах

---

### 10. Безопасность

#### 10.1. Валидация URL

**Проблема:** Предотвратить подмену URL изображения.

**Решение:**

- Разрешать только URL из домена CDN (`cdn.mentala.app`)
- Валидация через whitelist

```typescript
function isValidImageUrl(url: string): boolean {
  const allowedDomains = [
    'cdn.mentala.app',
    process.env.NUXT_CDN_BASE_URL?.replace('https://', '').replace(
      'http://',
      ''
    ),
  ].filter(Boolean);

  try {
    const urlObj = new URL(url);
    return allowedDomains.includes(urlObj.hostname);
  } catch {
    return false;
  }
}
```

#### 10.2. CORS настройки R2

- Разрешить запросы только с доменов приложения
- Не разрешать публичный доступ к bucket (только через CDN)

---

## 📝 Порядок реализации

### Этап 1: Инфраструктура (1-2 дня)

1. ✅ Настройка R2 bucket
2. ✅ Добавление переменных окружения
3. ✅ Создание сервиса для работы с R2
4. ✅ Скрипт загрузки изображений

### Этап 2: Схема БД и DTO (0.5 дня)

1. ✅ Миграция для `user_preferences.notification_images_enabled`
2. ✅ Обновление Drizzle schema
3. ✅ Обновление DTO (`UserPreferencesDto`)

### Этап 3: Логика выбора изображений (1 день)

1. ✅ Функция `getNotificationImage()`
2. ✅ Интеграция с каталогами
3. ✅ Проверка существования в R2
4. ✅ Кеширование в Redis

### Этап 4: Интеграция в генерацию слотов (0.5 дня)

1. ✅ Добавление `image` в `NotificationPayload` в `global-orchestration.service.ts`
2. ✅ Тестирование генерации слотов

### Этап 5: API для настроек (0.5 дня)

1. ✅ Обновление `PATCH /api/user/preferences`
2. ✅ UI для управления настройкой (опционально)

### Этап 6: Тестирование и оптимизация (1 день)

1. ✅ Юнит-тесты
2. ✅ Интеграционные тесты
3. ✅ E2E тесты
4. ✅ Оптимизация производительности

### Этап 7: Загрузка изображений (1 день)

1. ✅ Создание изображений дизайнером
2. ✅ Оптимизация изображений
3. ✅ Загрузка в R2

---

## ✅ Критерии приемки

### Функциональные:

- [ ] Уведомления для каталогных тем содержат изображения
- [ ] Уведомления для кастомных тем не содержат изображений
- [ ] Настройка `notificationImagesEnabled` работает корректно
- [ ] Fallback работает при отсутствии изображения в R2
- [ ] Изображения отображаются на Android 7+
- [ ] Изображения отображаются на iOS 10+
- [ ] Изображения отображаются в Web (PWA)

### Технические:

- [ ] Все изображения хранятся в R2
- [ ] Кеширование проверок существования работает
- [ ] Валидация URL изображений работает
- [ ] Логирование ошибок работает
- [ ] Производительность не ухудшилась

### Безопасность:

- [ ] URL изображений валидируются (whitelist доменов)
- [ ] CORS настроен корректно
- [ ] Нет утечек чувствительных данных в логах

---

## 🔧 Технические детали

### Зависимости

**Новые пакеты:**

```json
{
  "@aws-sdk/client-s3": "^3.x", // Для работы с R2 (S3-совместимое API)
  "sharp": "^0.33.0" // Опционально: для оптимизации изображений
}
```

### Структура файлов

```
server/
├── application/
│   └── notifications/
│       ├── notification-images.service.ts  # Новый сервис
│       └── ...
├── infrastructure/
│   └── storage/
│       └── r2.client.ts  # Новый клиент для R2
└── ...

scripts/
└── upload-notification-images.ts  # Скрипт загрузки
```

---

## 📚 Дополнительные материалы

### Ссылки на документацию:

- [FCM Notification Images (Android)](https://firebase.google.com/docs/cloud-messaging/android/send-image)
- [FCM Notification Images (iOS)](https://firebase.google.com/docs/cloud-messaging/ios/send-image)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [AWS S3 SDK (для R2)](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)

---

## 🎨 Дизайн изображений

### Рекомендации:

1. **Стиль:** Минималистичный, соответствует бренду Mentala
2. **Цвета:** Использовать цвета из каталогов (`color` поле в `therapyCatalog.ts`)
3. **Эмодзи:** Использовать emoji из каталогов как основу для дизайна
4. **Текст:** Избегать текста на изображении (текст в уведомлении отдельно)
5. **Контраст:** Обеспечить читаемость текста уведомления поверх изображения

### Примеры:

- **Вода (habits/water):** Синие тона, капли воды, эмодзи 💧
- **Тревога (therapy/anxiety):** Спокойные синие/зелёные тона, дыхательные паттерны
- **Стресс (therapy/stress):** Успокаивающие серые/голубые тона, эмодзи 😮‍💨

---

## ⚠️ Важные замечания

1. **Обратная совместимость:** Уведомления без изображений должны работать как раньше
2. **Производительность:** Проверка существования изображений не должна замедлять генерацию слотов
3. **Масштабируемость:** Решение должно работать при большом количестве пользователей
4. **Стоимость:** R2 имеет лимиты на запросы, нужно мониторить использование

---

## 📅 Сроки

**Общая оценка:** 5-7 рабочих дней

- Инфраструктура: 1-2 дня
- Разработка: 2-3 дня
- Тестирование: 1 день
- Загрузка изображений: 1 день

---

**Дата создания:** 2025-01-XX  
**Версия:** 1.0  
**Статус:** Готово к реализации
