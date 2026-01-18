ТЗ: Подключение Object Storage + CDN (Yandex Cloud) для медиа Mentala

Цели 1. Хранить медиафайлы (аудио + картинки медитаций + картинки уведомлений) в Yandex Object Storage. 2. Раздавать медиа пользователям через Yandex Cloud CDN (быстро, кэшируемо, дешевле нагрузки на VPS). 3. В кодовой базе перейти от путей вида /meditations/... к URL, формируемым от CDN base URL.

Термины (коротко)
• S3-совместимый = сервис понимает AWS S3 API. То есть Object Storage Яндекса можно использовать через инструменты/SDK, рассчитанные на S3 (AWS CLI, AWS SDK), просто меняется endpoint. Официально: “Static access keys compatible with the AWS API”
https://yandex.cloud/en/docs/iam/concepts/authorization/access-key ￼
Quickstart по S3 API: https://yandex.cloud/en/docs/storage/s3/s3-api-quickstart ￼

⸻

Глава 1. Настройка в Yandex Cloud (консоль): что создать и где нажимать

1. Подготовка: облако, каталог (folder), биллинг
   • Войти в консоль: https://console.yandex.cloud/
   • Создать Cloud и Folder (если ещё нет). Все ресурсы дальше будут внутри folder.

2. Создать бакеты Object Storage

Официальная инструкция “Creating a bucket”:
https://yandex.cloud/en/docs/storage/operations/buckets/create ￼

Рекомендуемая структура: 1–2 бакета (в зависимости от подхода к доступу)
• Вариант A (проще): 1 публичный бакет + CDN
mentala-media-prod
Префиксы внутри:
• meditations/audio/...
• meditations/covers/...
• meditations/backgrounds/...
• notifications/...
• Вариант B (правильнее по безопасности): бакет приватный, доступ только через CDN
(к нему можно применить policy “только сети CDN” — это уже следующий шаг)

Именование: коротко, уникально, без пробелов, латиница/цифры/дефисы.

3. Создать сервисный аккаунт и ключи доступа (чтобы заливать файлы)

Тебе нужен Service Account + Static access key (Key ID + Secret).
• “Managing static access keys”:
https://yandex.cloud/en/docs/iam/operations/authentication/manage-access-keys ￼
• Что такое static access key:
https://yandex.cloud/en/docs/iam/concepts/authorization/access-key ￼

Шаги (через консоль): 1. IAM → Service accounts → Create service account (например mentala-storage-sa) 2. Выдать роль на folder: минимум для работы с бакетами — см. требования в доке про bucket create (там указан минимум роли для создания)
https://yandex.cloud/en/docs/storage/operations/buckets/create ￼ 3. В сервисном аккаунте: Create new key → Create static access key 4. Сохранить Key ID и Secret key (секрет показывается один раз).

Если хочешь хранить ключи безопаснее: Yandex Lockbox (опционально)
https://yandex.cloud/en/docs/tutorials/security/static-key-in-lockbox/console ￼

4. Загрузить медиафайлы в бакет

Официально: “Uploading an object”:
https://yandex.cloud/en/docs/storage/operations/objects/upload ￼

Можно делать:
• руками через консоль (на старте ок),
• или AWS CLI / SDK (удобнее для пачек, CI).

5. Настроить CORS (если медиа будут запрашиваться из webview/браузера)

Официальная инструкция (обновлена 13 Jan 2026):
https://yandex.cloud/en/docs/storage/operations/buckets/cors ￼

Минимально для медиа обычно хватает:
• Allowed origins: _ (или строго твой домен/приложение)
• Allowed methods: GET, HEAD
• Allowed headers: _

6. Подключить Cloud CDN к бакету

CDN умеет брать origin из бакета. Официально:
• Quickstart CDN: https://yandex.cloud/en/docs/cdn/quickstart ￼
• Создание CDN resource (origin может быть Bucket):
https://yandex.cloud/en/docs/cdn/operations/resources/create-resource ￼
• Концепция CDN (origin = bucket):
https://yandex.cloud/en/docs/cdn/concepts/ ￼

Шаги (в консоли): 1. Cloud CDN → Create resource 2. Origin: Bucket → выбрать твой бакет 3. Указать домен для раздачи, например:
• media.mentala.me (или cdn.mentala.me) 4. Включить нужные настройки кэша (по умолчанию ок для старта).

7. HTTPS: сертификат и домен (чтобы было красиво и безопасно)
   • Certificate Manager quickstart:
   https://yandex.cloud/en/docs/certificate-manager/quickstart/ ￼
   • Пример end-to-end туториала (Object Storage + CDN + DNS + сертификат):
   https://yandex.cloud/en/docs/tutorials/applied/cdn-hosting/console ￼

Шаги: 1. Certificate Manager → выпустить Let’s Encrypt сертификат для media.mentala.me 2. DNS (у регистратора/в Yandex Cloud DNS) → создать CNAME на адрес CDN ресурса (он будет показан в настройках CDN). 3. Привязать сертификат к CDN ресурсу (если требуется в UI).

8. (Опционально) Закрыть прямой доступ к бакету и оставить только CDN

Если хочешь, чтобы медиа нельзя было “тащить” напрямую из storage URL, а только через CDN — можно ограничить бакет policy по подсетям CDN.
Официальная статья:
https://yandex.cloud/en/docs/troubleshooting/storage/how-to/permit-bucket-access-only-to-cdn-networks ￼
Bucket policy reference:
https://yandex.cloud/en/docs/storage/concepts/policy ￼

⸻

Глава 2. Изменения в кодовой базе Mentala (Nuxt/Vue + seed + хранение путей)

2.1. Что меняем концептуально

Сейчас у тебя в БД/seed лежат пути вида:
• /meditations/rain-night.m4a
• /meditations/covers/...webp

В продакшне это лучше заменить на один из вариантов:

Вариант 1 (рекомендую): хранить в БД “ключ объекта” (object key), а URL собирать в коде
• В БД: audioKey = "meditations/audio/rain-night.m4a"
• В коде: url = MEDIA_BASE_URL + "/" + audioKey

Плюсы: можно сменить CDN/домен без миграции БД.
Минус: надо один раз привести данные к ключам.

Вариант 2: хранить полный URL в БД
• https://media.mentala.me/meditations/audio/rain-night.m4a
Проще, но хуже для переездов/версий.

2.2. Конфиг: добавить base URL для медиа

В .env / секретах:
• NUXT_PUBLIC_MEDIA_BASE_URL=https://media.mentala.me (CDN домен)

В nuxt.config:
• пробросить в runtimeConfig.public.

Дальше в клиенте:
• const mediaBase = useRuntimeConfig().public.mediaBaseUrl

2.3. Обновить модели/типы трека

Сейчас:

audioPath: '/meditations/rain-night.m4a'

Станет (пример для варианта 1):

audioKey: 'meditations/audio/rain-night.m4a'
coverKey: 'meditations/covers/rain-night.webp'
backgroundKey: 'meditations/backgrounds/rain-night.webp'

И helper:

export function mediaUrl(key: string) {
const { public: cfg } = useRuntimeConfig();
return `${cfg.mediaBaseUrl}/${key}`;
}

2.4. Обновить seed-meditations.ts

Тебе нужно заменить поля audioPath/coverPath/backgroundPath на ключи (или на полные URL — если выберешь вариант 2).

Плюс: можно оставить обратную совместимость:
• если начинается с http → считать это уже URL
• иначе → считать ключом и доклеивать base.

2.5. Обновить места использования в UI
• Плеер должен брать src из mediaUrl(track.audioKey)
• Картинки: img :src="mediaUrl(track.coverKey)", и т.п.

2.6. Кеширование и версии файлов

Чтобы CDN эффективно кэшировал:
• Для неизменяемых файлов делай versioned filenames:
• rain-night.v1.m4a или rain-night-<hash>.m4a
• Тогда можно ставить долгий cache-control на CDN/объекте.

2.7. Уведомления: картинки
• Аналогично: хранить notificationImageKey и в payload пуша прокидывать CDN URL.
• Важно: некоторые пуш-системы кешируют/переиспользуют URL — стабильный CDN домен здесь плюс.

2.8. Что НЕ делаем на первом этапе (чтобы было недорого и просто)
• Не делаем загрузку пользователями (upload из приложения) → значит, не нужны pre-signed URL.
• Не делаем сложные правила доступа по пользователям.
• Не делаем медиапайплайн в фоне.

⸻

Acceptance Criteria (критерии готовности) 1. В Object Storage лежат все медиа по ключам (структура префиксов). 2. Медиа открываются по CDN-домену (пример: https://media.mentala.me/meditations/audio/rain-night.m4a). 3. Приложение больше не зависит от файлов в public для продакшна. 4. В dev можно оставить локальные файлы, а в prod — CDN (через NUXT_PUBLIC_MEDIA_BASE_URL). 5. CORS настроен и медиа корректно загружается в web.

⸻

Мини-ответ на твой вопрос “нужен ли отдельный сервер у Яндекса?”

Нет. Object Storage и CDN — это управляемые сервисы. У тебя остаётся твой VPS (API/БД/рендер), а медиа уходит в storage и раздаётся CDN. “S3-совместимость” — это про API-доступ/инструменты, а не про то, что ты поднимаешь свой S3-сервер. ￼

⸻

Если хочешь, я следующим шагом могу:
• предложить конкретную структуру ключей под твои текущие папки (meditations/_, notifications/_),
• и дать готовый код-хелпер + пример миграции (скрипт, который превращает старые /meditations/... в meditations/audio/...).
