# Release Strategy и совместимость версий (Mentala)

## Контекст

Mentala использует единый production backend и три канала доставки:

- web обновляется сразу после деплоя;
- iOS обновляется через App Store с задержкой;
- Android обновляется через Google Play с задержкой.

Из-за этого mobile-клиенты могут работать на старых build еще некоторое время после релиза сервера и web.

Основные риски:

- несовместимость API;
- падения клиента из-за изменения контрактов;
- некорректная работа платежей, push и навигации;
- ошибки из-за breaking schema changes в БД.

## Цель

Для v1 нужно обеспечить устойчивость системы к рассинхронизации релизов без многоверсионного production runtime.

Целевое поведение:

- production backend всегда один;
- production schema БД всегда одна и эволюционирует поэтапно;
- сервер деплоится первым и остается обратно совместимым с поддерживаемыми mobile build;
- новый клиент обязан корректно переживать короткое окно rollback/deploy race;
- устойчивость обеспечивается не синхронным релизом, а совместимостью сервера и контролем минимальной поддерживаемой версии.

## Решения v1

Для первой версии стратегии фиксируются следующие решения:

- используется один production backend;
- используется одна production schema БД;
- в v1 реализуется только `required update`;
- `recommended update` в v1 не используется;
- `force update` не включается автоматически на каждый релиз;
- блокировка включается только для неподдерживаемых или аварийных mobile build;
- `release/*` ветки используются только для stabilization и hotfix, но не как основа многоверсионного production runtime.

## Базовые правила совместимости

### 1. Обратная совместимость сервера обязательна

Сервер не должен ломать поддерживаемые mobile build:

- нельзя удалять поля из API, пока старые build еще поддерживаются;
- нельзя менять тип данных существующего поля с breaking-эффектом;
- нельзя делать ранее необязательные поля обязательными без переходного периода;
- новые поля нужно добавлять, а не заменять существующие;
- старые endpoint и старые форматы ответа удаляются только после полного вывода старых build из поддержки.

Это правило действует для всех production API и всех shared DTO.

### 2. Клиент обязан отправлять версионные заголовки

Каждый клиентский запрос должен содержать:

- `X-Platform: ios | android | web`
- `X-App-Version: 1.3.0`
- `X-App-Build: 42`

Назначение полей:

- `X-Platform` используется сервером для определения канала авторизации, платформенной логики и update policy;
- `X-App-Version` используется для логов, аналитики, саппорта и диагностики;
- `X-App-Build` используется сервером для сравнения версии и enforcement;
- сравнение выполняется по `build`, а не по строке `version`.

Дополнительные правила:

- маркетинговая версия может следовать SemVer;
- build number на каждой платформе обязан быть монотонно возрастающим integer;
- на mobile `version` и `build` берутся из нативного runtime через `App.getInfo()` (Capacitor);
- на web `X-App-Build` равен `0`, `X-App-Version` равен версии из `package.json` или пустой строке.

Примечание: заголовок `X-Platform` уже используется во всей кодовой базе (авторизация, платежи, подписки, CORS). Имя зафиксировано как финальное.

### 3. Политика обновления в v1

В v1 сервер управляет только минимальной поддерживаемой версией.

Сервер хранит `minimumSupportedBuild` отдельно для:

- iOS;
- Android.

Клиент обязан проверять update policy:

- на cold start;
- при возврате приложения в foreground / resume (с debounce не чаще 1 раза в 60 секунд).

Если `build < minimumSupportedBuild`, клиент:

- показывает full-screen blocker;
- блокирует доступ к приложению;
- предлагает перейти в store для обновления.

Если update policy endpoint недоступен (сетевая ошибка, таймаут):

- клиент продолжает работу (fail-open);
- кэшируется последний успешный ответ в `@capacitor/preferences`;
- повторная проверка при следующем foreground resume.

Web не участвует в forced update логике. При `platform=web` сервер всегда возвращает `{status: 'ok'}`.

`recommended update`, мягкие напоминания и rollout update policy по сегментам в v1 не описываются и не являются обязательной частью реализации.

### 4. Публичный клиент-серверный контракт

Для v1 фиксируется следующий контракт update policy.

Endpoint: `GET /api/app/update-policy`

- Без аутентификации (доступен на cold start до логина);
- Исключен из CSRF middleware;
- Rate limit: стандартный (180 req/min).

Request headers:

- `X-Platform`
- `X-App-Version`
- `X-App-Build`

Response body:

- `status` — `'ok' | 'required'`
- `minimumSupportedBuild` — integer (текущий порог для платформы)
- `storeUrl` — URL для перехода в store
- `title` — заголовок blocker (i18n ключ или строка)
- `message` — сообщение blocker (i18n ключ или строка)

Поведение endpoint при отсутствии `X-App-Build`:

- если `platform=web` или заголовок отсутствует → `{status: 'ok'}`;
- если `platform=ios|android` и `X-App-Build` отсутствует → `{status: 'ok'}` (обратная совместимость со старыми build, которые не отправляют заголовок).

Shared DTO:

- Контракт определяется Zod-схемой в `shared/dto/update-policy.ts`;
- Используется и сервером (валидация), и клиентом (типизация).

### 5. Серверное хранилище version policy

`minimumSupportedBuild` хранится в таблице БД `app_version_policy`:

| Колонка | Тип | Описание |
|---------|-----|----------|
| platform | varchar, PK | `'ios'` или `'android'` |
| minimum_supported_build | integer, NOT NULL | Минимальный поддерживаемый build |
| store_url | text, NOT NULL | URL для перехода в store |
| blocker_title | text | Заголовок blocker экрана |
| blocker_message | text | Сообщение blocker экрана |
| updated_at | timestamp | Время последнего обновления |
| updated_by | varchar | Кто обновил (admin email или 'migration') |

Начальные значения (seed через миграцию, INSERT ... ON CONFLICT DO NOTHING):

- iOS: `minimumSupportedBuild = 1`, `storeUrl = 'https://apps.apple.com/app/id<APP_ID>'`
- Android: `minimumSupportedBuild = 1`, `storeUrl = 'https://play.google.com/store/apps/details?id=com.mentala.app'`

Изменение через:

- Admin endpoint `PATCH /api/admin/app-version-policy`;
- Прямой SQL как fallback (аварийный rollback).

Кэширование: in-memory на сервере с TTL 60 секунд.

Повышение `minimumSupportedBuild` — только ручное действие. Не привязано автоматически ни к какому типу изменения.

### 6. Feature flags не являются обязательной базой v1

Feature flags допускаются как future / phase 2 capability, но:

- не являются обязательным условием запуска версии-совместимости;
- не заменяют политику минимальной поддерживаемой версии;
- не используются как аргумент в пользу отказа от backward compatibility.

Если позже появится полноценная server-driven feature flag платформа, она должна встраиваться поверх этой стратегии, а не вместо нее.

### 7. Двухфазные миграции БД обязательны

Любые breaking schema changes запрещены, пока старые поддерживаемые build еще могут работать в production.

Допустимый порядок изменений только такой:

1. `expand` — добавить новое поле, таблицу, индекс или новый формат данных;
2. `dual support` — сервер одновременно поддерживает старую и новую схему/логику;
3. `mobile rollout` — выпустить mobile build с новой логикой и дождаться вывода старых build из поддержки;
4. `contract cleanup` — удалить старую схему, старый endpoint или старый формат ответа.

Явно запрещено в качестве целевой архитектуры Mentala:

- держать отдельные production БД под разные версии клиента;
- держать несколько несовместимых production backend для одной и той же аудитории;
- переносить проблему совместимости из API-контрактов в инфраструктуру multi-version runtime.

## Типы изменений

### Type A — server/content/config changes

Не требуют обязательного mobile-релиза сами по себе:

- тексты;
- контент;
- конфиги;
- server-side логика;
- исправления, не меняющие клиентский контракт.

### Type B — JS/UI/client logic changes

Требуют mobile-релиза, если меняется bundle внутри Capacitor:

- UI;
- страницы;
- клиентская логика;
- обработка API-ответов;
- клиентские сценарии навигации.

### Type C — native/store/platform changes

Всегда требуют новый store build:

- Capacitor plugins;
- push;
- платежи;
- permissions;
- нативные bridge и platform-specific behavior.

Отдельное правило:

- повышение `minimumSupportedBuild` не привязано автоматически ни к одному типу изменения;
- решение о блокировке старых build принимается отдельно.

## Процесс релиза

### Порядок выката

1. Деплой сервера.
2. Проверка, что сервер обратно совместим с поддерживаемыми mobile build.
3. Деплой web.
4. Сборка mobile release через production pipeline проекта.
5. Тестирование mobile-сборок в каналах тестирования.
6. Публикация в сторы.
7. После подтверждения доступности нового build в store/testing каналах при необходимости повышается `minimumSupportedBuild`.

### Mobile release pipeline

Для проекта Mentala production mobile release должен опираться на текущий пайплайн репозитория, а не на абстрактные команды.

Ориентир:

- production bundle собирается из production-конфига проекта;
- для Capacitor используется production sync pipeline проекта;
- проверка release env и prod-safe runtime config обязательна до публикации.

### Release-ветки

`release/*` ветки допускаются только как процессный инструмент:

- stabilization перед релизом;
- QA;
- hotfix конкретного релиза.

Они не должны трактоваться как:

- постоянные parallel production backend;
- отдельные production БД под каждую версию;
- основная модель поддержки нескольких несовместимых runtime-версий продукта.

## Платформенные правила обновления

### iOS

В v1 используется следующая модель:

- клиент получает update policy с сервера;
- при `status=required` показывает blocker;
- blocker ведет пользователя в App Store через `storeUrl`.

Store URL формат: `https://apps.apple.com/app/id<APP_ID>`

### Android

В v1 используется следующая модель:

- клиент получает update policy с сервера;
- при `status=required` показывает blocker;
- blocker ведет пользователя в Google Play через `storeUrl`.

Store URL формат: `https://play.google.com/store/apps/details?id=com.mentala.app`

In-App Updates (Immediate Update) не входит в v1. Может быть добавлено в v2 после установки соответствующего Capacitor-плагина.

### Web

Web не участвует в forced update логике по умолчанию.

Для web достаточно стандартного поведения канала:

- новая версия становится доступна сразу после деплоя;
- отдельная политика `minimumSupportedBuild` для web в рамках v1 не вводится;
- endpoint update-policy при `platform=web` всегда возвращает `{status: 'ok'}`.

## Безопасность mobile env

В mobile build разрешено включать только:

- публичные URL;
- публичные идентификаторы;
- не секретные runtime-параметры.

Запрещено включать:

- API keys с server-side правами;
- приватные ключи;
- платежные секреты;
- Firebase Admin credentials;
- любые server-side credentials.

## Observability и rollback

### Мониторинг

- Сервер логирует каждый запрос с `status=required` (платформа, build, timestamp);
- При аномальном росте blocked-запросов — Telegram alert через существующий `telegramAlertsWorker`;
- Admin endpoint позволяет посмотреть текущие значения `minimumSupportedBuild`.

### Rollback процедура

Если `minimumSupportedBuild` выставлен ошибочно:

1. Через admin endpoint: `PATCH /api/admin/app-version-policy` с пониженным значением;
2. Через прямой SQL: `UPDATE app_version_policy SET minimum_supported_build = 1 WHERE platform = 'ios'`;
3. Кэш сервера обновится в течение TTL (60 секунд);
4. Клиенты при следующем foreground resume получат `{status: 'ok'}`.

## Test Cases для стратегии

- старый, но поддерживаемый mobile build продолжает работать после server deploy;
- mobile build ниже `minimumSupportedBuild` блокируется на cold start;
- повторная проверка update policy срабатывает после возврата приложения из background;
- blocker корректно уводит пользователя в store (iOS → App Store, Android → Google Play);
- server contract не ломается для старых поддерживаемых build после добавления новых полей или endpoint;
- миграция БД по схеме `expand -> dual support -> mobile rollout -> contract cleanup` не ломает старые поддерживаемые клиенты;
- web с `X-App-Build=0` всегда получает `{status: 'ok'}`;
- mobile build без заголовка `X-App-Build` (старые сборки) получает `{status: 'ok'}`;
- при недоступности endpoint update-policy клиент продолжает работу (fail-open);
- множественные foreground resume events не вызывают flood запросов (debounce 60 сек);
- blocker показывается немедленно, даже если пользователь в активной сессии (данные сохраняются при уходе в фон).

## Что не входит в v1

В рамках этой версии документа явно не проектируются:

- многоверсионный production backend;
- отдельная production БД под каждую версию клиента;
- `recommended update`;
- rollout update policy по сегментам;
- полноценная feature flag платформа как обязательная часть релизной стратегии;
- In-App Updates для Android (Immediate Update).

Это может быть добавлено во вторую итерацию, если появится реальная операционная необходимость.

## Главный принцип

Не синхронизация релизов любой ценой, а устойчивость к их рассинхронизации через:

- один production backend;
- одну эволюционирующую production schema;
- backward compatibility сервера;
- минимальную поддерживаемую mobile build-версию;
- поэтапные и обратимо безопасные миграции.
