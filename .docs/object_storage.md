# ТЗ: Подключение Object Storage + CDN (Yandex Cloud) для медиа Mentala

Документ объединяет: настройку Object Storage и CDN в Yandex Cloud и перевод медиа приложения на внешний base URL (без использования `public/meditations/` в продакшене).

## Цели

1. Хранить медиафайлы (аудио + картинки медитаций + картинки уведомлений) в Yandex Object Storage.
2. Раздавать медиа пользователям через Yandex Cloud CDN (быстро, кэшируемо, дешевле нагрузки на VPS).
3. В кодовой базе перейти от путей вида `/meditations/...` к URL, формируемым от CDN base URL.
4. Локальная папка `public/meditations/**` не используется как источник для продакшена.

---

## Термины (коротко)

- **S3-совместимый** — сервис понимает AWS S3 API. Object Storage Яндекса можно использовать через инструменты/SDK для S3 (AWS CLI, AWS SDK), меняется только endpoint.
  - [Static access keys (Yandex)](https://yandex.cloud/en/docs/iam/concepts/authorization/access-key)
  - [S3 API Quickstart (Yandex)](https://yandex.cloud/en/docs/storage/s3/s3-api-quickstart)

---

## Глава 1. Настройка в Yandex Cloud (консоль)

### 1. Подготовка: облако, каталог (folder), биллинг

- Войти в консоль: https://console.yandex.cloud/
- Создать Cloud и Folder (если ещё нет). Все ресурсы дальше будут внутри folder.

### 2. Создать бакеты Object Storage

- [Creating a bucket](https://yandex.cloud/en/docs/storage/operations/buckets/create)

Рекомендуемая структура: 1–2 бакета (в зависимости от подхода к доступу).

- **Вариант A (проще):** 1 публичный бакет + CDN, например `mentala-media-prod`. Префиксы внутри:
  - `meditations/audio/...`
  - `meditations/covers/...`
  - `meditations/backgrounds/...`
  - `notifications/...`
- **Вариант B (безопаснее):** бакет приватный, доступ только через CDN (policy «только сети CDN»).

Именование: коротко, уникально, без пробелов, латиница/цифры/дефисы.

### 3. Сервисный аккаунт и ключи доступа (для загрузки файлов)

Нужен Service Account + Static access key (Key ID + Secret).

- [Managing static access keys](https://yandex.cloud/en/docs/iam/operations/authentication/manage-access-keys)
- [Static access key](https://yandex.cloud/en/docs/iam/concepts/authorization/access-key)

Шаги: IAM → Service accounts → Create (например `mentala-storage-sa`) → выдать роль на folder (минимум для бакетов по доке) → Create new key → Create static access key → сохранить Key ID и Secret (секрет показывается один раз).

Опционально: [Yandex Lockbox](https://yandex.cloud/en/docs/tutorials/security/static-key-in-lockbox/console) для хранения ключей.

### 4. Загрузить медиафайлы в бакет

- [Uploading an object](https://yandex.cloud/en/docs/storage/operations/objects/upload)
- Вручную через консоль или через AWS CLI / SDK (удобнее для пачек и CI).

### 5. Настроить CORS (если медиа запрашиваются из webview/браузера)

- [CORS для бакетов](https://yandex.cloud/en/docs/storage/operations/buckets/cors)

Минимально: Allowed origins `*` или твой домен, methods GET/HEAD, headers по необходимости.

### 6. Подключить Cloud CDN к бакету

- [CDN Quickstart](https://yandex.cloud/en/docs/cdn/quickstart)
- [Создание CDN resource (origin = Bucket)](https://yandex.cloud/en/docs/cdn/operations/resources/create-resource)
- [Концепция CDN](https://yandex.cloud/en/docs/cdn/concepts/)

В консоли: Cloud CDN → Create resource → Origin: Bucket → выбрать бакет → указать домен раздачи (например `media.mentala.app`) → настроить кэш.

### 7. HTTPS: сертификат и домен

- [Certificate Manager quickstart](https://yandex.cloud/en/docs/certificate-manager/quickstart/)
- [Туториал: Object Storage + CDN + DNS + сертификат](https://yandex.cloud/en/docs/tutorials/applied/cdn-hosting/console)

Шаги: Certificate Manager → Let's Encrypt для `media.mentala.app` → DNS CNAME на CDN → привязать сертификат к CDN при необходимости.

### 8. (Опционально) Доступ только через CDN

Чтобы медиа нельзя было забирать напрямую из storage URL:

- [Ограничение доступа к бакету только сетями CDN](https://yandex.cloud/en/docs/troubleshooting/storage/how-to/permit-bucket-access-only-to-cdn-networks)
- [Bucket policy](https://yandex.cloud/en/docs/storage/concepts/policy)

---

## Глава 2. Изменения в кодовой базе Mentala

### 2.1. Текущее состояние

- В БД (и в сидере) поля `audioPath` / `coverPath` / `backgroundPath` хранят путь от корня, например:
  - `/meditations/audio/nature/rain-night.m4a`
  - `/meditations/covers/rain-night.webp`
  - `/meditations/backgrounds/rain-night.webp`
- В коде: `topicKey` обязателен, `topicKeys?: string[]` опционален (трек может отображаться в нескольких темах).

### 2.2. Концепция хранения путей

Варианты:

- **Вариант 1 (рекомендуется для новых систем):** в БД хранить «ключ объекта» без ведущего слэша, URL собирать в коде. Плюс: смена CDN/домена без миграции БД.
- **Вариант 2 (минимальные изменения):** не менять схему БД — остаются относительные пути вида `/meditations/...`. Меняется только то, как приложение превращает путь в URL: `mediaBaseUrl + path`.

В обоих случаях итоговый URL: `https://media.mentala.app/meditations/audio/...`.

### 2.3. Конфигурация окружения

В `.env` / секретах (обязательная в проде):

```bash
NUXT_PUBLIC_MEDIA_BASE_URL=https://media.mentala.app
```

- `.env.development` — для локальной разработки (можно тестовый CDN).
- `.env` / `.env.production` — для продакшена. Пустое значение в проде не допускается.

В `nuxt.config`: пробросить в `runtimeConfig.public.mediaBaseUrl` (должен быть доступен на клиенте). Пример:

```ts
runtimeConfig.public.mediaBaseUrl = process.env.NUXT_PUBLIC_MEDIA_BASE_URL ?? ''
```

### 2.4. Единая функция построения URL

Утилита (например `shared/lib/mediaUrl.ts` или `shared/utils/media.ts`):

- Вход: `path: string | null | undefined`.
- Если `path` уже абсолютный (`http://` или `https://`) → вернуть как есть.
- Если `path` начинается с `/` → вернуть `${mediaBaseUrl}${path}` (избегать двойных слэшей).
- Если `path` пустой → пустая строка.
- Если `mediaBaseUrl` пустой → залогировать ошибку и вернуть пустую строку (локальные пути в проде не использовать).

Пример (для варианта с ключами без ведущего слэша):

```ts
export function mediaUrl(keyOrPath: string | null | undefined): string {
  const { public: cfg } = useRuntimeConfig()
  if (!keyOrPath) return ''
  if (keyOrPath.startsWith('http://') || keyOrPath.startsWith('https://')) return keyOrPath
  const base = (cfg.mediaBaseUrl ?? '').replace(/\/$/, '')
  const path = keyOrPath.startsWith('/') ? keyOrPath : `/${keyOrPath}`
  return base ? `${base}${path}` : ''
}
```

### 2.5. Модели и типы (если меняем на ключи)

При переходе на вариант с ключами в БД:

- Было: `audioPath: '/meditations/rain-night.m4a'`
- Стало: `audioKey: 'meditations/audio/rain-night.m4a'`, `coverKey`, `backgroundKey` — и везде использовать `mediaUrl(track.audioKey)` и т.д.

Если оставляем текущую схему — поля остаются `audioPath`/`coverPath`/`backgroundPath`, в UI везде используется `mediaUrl(track.audioPath)`.

### 2.6. Seed (meditations)

В сидере пути должны соответствовать структуре в бакете (либо относительные пути `/meditations/...`, либо ключи без слэша). Можно добавить обратную совместимость: если значение начинается с `http` — считать полным URL, иначе — ключ/путь и собирать URL через `mediaBaseUrl`.

### 2.7. Применить утилиту во всех местах UI

Обязательные точки:

- карточки треков (cover, background);
- экран плеера (cover, background);
- сам аудио-источник (`<audio src="...">` или плеер).

В UI и плеере не должно остаться прямых ссылок на `/meditations/...` без префикса `mediaBaseUrl`. API может продолжать отдавать относительные пути — клиент собирает финальный URL через `mediaUrl()`.

### 2.8. Разделы и фильтрация по темам (topicKey + topicKeys)

Трек принадлежит теме X, если:

- `track.topicKey === X` или
- `track.topicKeys?.includes(X) === true`

При этом `topicKeys` может отсутствовать; `topicKey` обязателен.

### 2.9. Убрать зависимость от public/meditations

- Удалить `public/meditations/**` из проекта или не включать в билд продакшена.
- Локально для разработки тоже использовать CDN (задать `NUXT_PUBLIC_MEDIA_BASE_URL` на тестовый CDN).

### 2.10. Кеширование и версии файлов

Для эффективного кэша CDN у неизменяемых файлов использовать versioned filenames: например `rain-night.v1.m4a` или `rain-night-<hash>.m4a`, и выставлять долгий Cache-Control на объекте/CDN.

### 2.11. Уведомления: картинки

Хранить ключ/путь изображения уведомления и в payload пуша отдавать полный CDN URL. Стабильный CDN-домен удобен для кэширования со стороны пуш-систем.

### 2.12. Что не делаем на первом этапе

- Загрузка файлов пользователями (upload из приложения) — pre-signed URL не нужны.
- Сложные правила доступа по пользователям.
- Медиапайплайн в фоне.

---

## Критерии приёмки

1. В Object Storage лежат все медиа по выбранной структуре (префиксы meditations/..., notifications/...).
2. Медиа открываются по CDN-домену (например `https://media.mentala.app/meditations/audio/rain-night.m4a`).
3. Приложение не зависит от файлов в `public/meditations` для продакшена; в dev можно оставить локальные файлы или тот же CDN через `NUXT_PUBLIC_MEDIA_BASE_URL`.
4. CORS настроен, медиа корректно загружаются в web.
5. В прод окружении `NUXT_PUBLIC_MEDIA_BASE_URL` не пустой; любой трек воспроизводится, cover/background загружаются по `https://media.mentala.app/...`.
6. Треки с `topicKeys` отображаются в соответствующих темах; без `topicKeys` — только по `topicKey`.
7. В Network (DevTools) нет запросов к медиа через локальный домен приложения или localhost — только к CDN-домену.

---

## Отдельный сервер у Яндекса не нужен

Object Storage и CDN — управляемые сервисы. VPS (API, БД, рендер) остаётся твоим; медиа хранятся в Storage и раздаются через CDN. S3-совместимость относится к API и инструментам, а не к развёртыванию своего S3-сервера.

---

При необходимости следующий шаг: конкретная структура ключей под текущие папки (`meditations/`, `notifications/`) и готовый код-хелпер + пример миграции (скрипт перевода старых `/meditations/...` в нужный формат ключей).
