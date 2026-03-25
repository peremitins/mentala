# ТЗ: Переход на чистый StoreKit 2 (iOS 15+) + Server API + ASN v2

Этот документ фиксирует **целевую архитектуру и список работ** по переходу на современный Apple IAP **без StoreKit 1** и без legacy `verifyReceipt`.

Решение команды:

- Минимальная iOS: **15+**
- WW-flow: **StoreKit 2 (In‑App Purchase API)** + server-side подтверждение (signed transactions / App Store Server API)
- События подписки: **App Store Server Notifications v2 (ASN v2)** — этап 2 (сразу после первого стабильного релиза)
- Legacy: `cordova-plugin-purchase`, receipt base64, `verifyReceipt`, `NUXT_APPLE_IAP_SHARED_SECRET` — **полностью удаляем**

Этапность (зафиксировано):

- **Этап 1 (MVP / первый релиз):** StoreKit 2 purchase/restore + server confirm (JWS), без ASN v2.
- **Этап 2 (надёжность):** подключаем ASN v2, чтобы renew/cancel/refund/revoke обновлялись на backend без открытия приложения.

Важно: это ТЗ **без реализации в этом этапе**. Здесь — “что и зачем делаем”, чтобы потом можно было спокойно кодить.

---

## 1) Цели

1) Упростить и “очистить” стек Apple IAP:
   - без receipt base64,
   - без shared secret,
   - с нормальными server-to-server событиями (ASN v2).
2) Сделать единый, предсказуемый источник правды на backend:
   - продления/отмены/рефанды не зависят от открытия приложения.
3) Снизить количество спорных кейсов (refund/chargeback) и ручных разбирательств.

---

## 2) Что именно удаляем (legacy‑контур)

### 2.1 Клиент (Nuxt/Capacitor)

Удаляем всё, что связано с Cordova IAP и StoreKit 1:

- зависимость `cordova-plugin-purchase` + связанные типы/обвязки
- JS‑композаблы/плагины, которые ждут `window.CdvPurchase`, `store.initialize`, `store.update`, `receiptBase64`
- любые места, где “цены из App Store” подтягиваются через Cordova‑плагин

### 2.2 Backend

Удаляем receipt‑валидацию:

- `verifyReceipt` client и весь код, который шлёт receipt base64 в Apple
- конфиги/ошибки, завязанные на shared secret

### 2.3 Окружение (env)

Удаляем из обязательных переменных:

- `NUXT_APPLE_IAP_SHARED_SECRET`

---

## 3) Целевая архитектура (StoreKit 2 only)

### 3.1 Клиент iOS (StoreKit 2)

Нужен **нативный Capacitor‑плагин** (Swift), который предоставляет в JS слой:

1) `getStorefrontCountryCode()`:
   - возвращает `countryCode` (нормализованный под backend формат `RU`, `DE`, ...)
   - при недоступном storefront возвращает `null` (без падения UI)
2) `getProducts(productIds)`:
   - обязательно возвращает: `productId`, `displayName`, `description`, `displayPrice`
   - если доступно: `currencyCode`, `locale`, `billingPeriod` (`month` | `year`)
   - продукт без `productId`/`displayPrice` считается невалидным и не должен попадать в итоговый список
3) `purchase(productId, appAccountToken)`:
   - инициирует покупку
   - возвращает только **verified transaction**: `transactionId` + `signedTransactionInfo` (JWS)
   - `unverified` трактуется как ошибка (`PURCHASE_UNVERIFIED`) и не подтверждается на backend
4) `restore()`:
   - вызывает `AppStore.sync()`
   - после `sync()` читает `Transaction.currentEntitlements`
   - возвращает актуальные verified entitlements/транзакции для последующего sync на backend
5) `getCurrentEntitlements()` (опционально, но желательно):
   - чтобы UI мог быстро отрисовать статус, но backend остаётся источником истины

**Обязательное требование:** использовать `appAccountToken` (UUID) для привязки к пользователю Mentala (без PII).

Runtime-требования StoreKit 2 (обязательно):
- клиент поднимает долгоживущий listener `Transaction.updates` при старте приложения/после логина
- verified события из `Transaction.updates` отправляются на backend для reconcile
- `await transaction.finish()` вызывается только после успешного `confirm` (`2xx`)
- при timeout/сетевой ошибке `confirm` вызов `finish()` запрещён до успешного retry
- пока `purchase()` выполняется, запуск повторной покупки блокируется (`purchaseInProgress`)
- при ошибке `confirm` клиент ставит транзакцию в retry-очередь (идемпотентные повторы с backoff)

Минимальный формат ошибок плагина (для фронтенда):
- `STOREKIT_UNAVAILABLE`
- `PRODUCTS_LOAD_FAILED`
- `PRODUCT_NOT_FOUND`
- `PURCHASE_CANCELLED`
- `PURCHASE_PENDING`
- `PURCHASE_UNVERIFIED`
- `SYNC_FAILED`
- `UNKNOWN`

---

### 3.2 Backend (Server API + проверка подписей)

Backend должен уметь:

1) Валидировать `signedTransactionInfo` (JWS) от клиента (StoreKit 2):
   - проверка подписи по ключам Apple,
   - проверка `bundleId`/`appAppleId`,
   - проверка `productId` (allowlist),
   - извлечение `originalTransactionId`, `transactionId`, `environment`, `purchaseDate`, `expiresDate`, `storefront`, `revocationDate`/`refundDate` (если есть).
2) Обрабатывать ASN v2:
   - валидировать `signedPayload` (JWS),
   - дедуп и идемпотентность (см. раздел 4.4),
   - обновлять подписку по событиям renew/cancel/refund/revoke/expired.
3) (Рекомендуется) Иметь reconciliation через App Store Server API:
   - периодическая сверка по `originalTransactionId` (история) для защиты от дыр в нотификациях.

---

## 4) Контракты API (цель)

### 4.1 Confirm (после user‑инициированной покупки)

`POST /api/subscriptions/apple/confirm`

Headers:
- `Idempotency-Key` (обязательно)

Body:
- `transactionId` (обязательно)
- `signedTransactionInfo` (обязательно) — JWS от StoreKit 2
- `appAccountToken` (рекомендуется, для связи транзакции с пользователем Mentala)
- `storefrontCountryCode` (опционально, диагностический контекст)

Правило:
- `originalTransactionId` извлекается сервером из JWS/App Store Server API и не принимается как источник истины из client body

Ответ:
- статус подписки в Mentala (active/none), planId, billingPeriod, expiresAt, environment

### 4.2 ASN v2 webhook

`POST /api/subscriptions/apple/notifications`

Body:
- `signedPayload` (обязательно)

Ответ:
- `200 OK` максимально быстро (тяжёлую работу — в очередь)

### 4.3 Restore / manual sync (опционально)

Можно добавить `POST /api/subscriptions/apple/sync`, если хотим явный ручной reconcile из приложения:

Body:
- список `transactionId`/`originalTransactionId` (или `signedTransactionInfo`) из текущих entitlements

### 4.4 Идемпотентность и дедуп (обязательно)

1) Confirm:
- ключ цепочки подписки: `originalTransactionId + environment`
- дедуп отдельных транзакций: `transactionId`
- повторный запрос с тем же `Idempotency-Key` и/или тем же `transactionId` не должен создавать дубль записи
- на уровне БД нужен уникальный инвариант для Apple-транзакций (`UNIQUE(transactionId)` или `UNIQUE(transactionId, environment)`)

2) ASN v2:
- дедуп по `notificationUUID` обязателен
- все обработчики должны быть идемпотентны по `originalTransactionId + environment`
- повторы и переупорядочивание уведомлений считаются нормальным поведением и не должны ломать состояние подписки

### 4.5 Upgrade / downgrade (subscription group)

- backend обрабатывает смену тарифа внутри одной Apple subscription group по `originalTransactionId`
- при новой verified транзакции с тем же `originalTransactionId` и другим `productId` обновляется текущая подписка пользователя (без создания параллельной active подписки)
- учитываем `isUpgraded` и связанные поля StoreKit 2 при расчёте актуального entitlement

### 4.6 Restore / reconcile edge case

- после `AppStore.sync()` + `Transaction.currentEntitlements` клиент отправляет verified транзакции на backend
- если entitlement найден, но backend не видит активную подписку (например, reinstall/new device/data loss), backend обязан восстановить состояние через `confirm/reconcile`

### 4.7 UX и App Review инварианты

- выбор flow на клиенте выполняется только по `billingProviderHint` от backend (storefront — входной сигнал)
- если storefront недоступен, backend возвращает безопасный дефолт `billingProviderHint='apple_iap'`
- на paywall обязательно показываем кликабельные ссылки Privacy Policy и Terms of Service

### 4.8 Confirm retry / timeout policy (обязательно)

- при timeout/network/`5xx` от `confirm` клиент обязан ретраить confirm идемпотентно
- `transaction.finish()` запрещён до получения успешного `confirm` (`2xx`)
- retries продолжаются после relaunch (персистентная очередь)

### 4.9 Daily reconcile job (рекомендуется)

- backend выполняет регулярную сверку (например, 1 раз в сутки) через App Store Server API (`getTransactionHistory`)
- reconcile закрывает пропущенные renew/refund/revoke/cancel события
- обработка reconcile идемпотентна и безопасна к повторным запускам

---

## 5) Что нужно в App Store Connect и секретах

### 5.1 App Store Connect

1) (Этап 2) Включить **App Store Server Notifications v2** и указать URL.
2) Сгенерировать **In‑App Purchase key** (Issuer ID / Key ID / private key `.p8`) — для App Store Server API.
3) Завести sandbox tester’ов для тестов (App Store Connect → Users and Access → Sandbox Testers).
4) Подготовить тестовый matrix минимум: purchase, renewal, cancel, refund/revoke.

### 5.2 Env vars (предлагаемые)

Server-only (секреты, строго не в клиентском бандле):
- `APPLE_IAP_BUNDLE_IDS` — allowlist bundle id
- `APPLE_IAP_ISSUER_ID`
- `APPLE_IAP_KEY_ID`
- `APPLE_IAP_PRIVATE_KEY_BASE64` (private key `.p8` в base64)
- (опционально) `APPLE_IAP_APPLE_ID` / `APPLE_IAP_APPLE_APP_ID`

Public/client env (только если реально нужно UI):
- `NUXT_PUBLIC_APPLE_IAP_ENABLED` (опциональный feature-flag)

Правило безопасности:
- приватные ключи и server credentials запрещено хранить в `NUXT_PUBLIC_*`.

---

## 6) Критерии готовности миграции (Definition of Done)

### 6.1 Этап 1 (MVP / первый релиз, допускается без ASN v2)

1) Минимальная iOS поднята до 15 (проект, документация, Xcode settings).
2) В кодовой базе нет `cordova-plugin-purchase` и нет `window.CdvPurchase`.
3) На backend удалён `verifyReceipt`‑контур и `NUXT_APPLE_IAP_SHARED_SECRET`.
4) Покупка/restore работают через StoreKit 2, подтверждение — через signed transactions (JWS).
5) Реализованы `Transaction.updates` listener и `transaction.finish()` только после успешного `confirm`.
6) На paywall есть Privacy Policy + Terms of Service.
7) Реализована retry-политика для `confirm` (timeout/network/5xx) без преждевременного `finish()`.

### 6.2 Этап 2 (надёжность)

1) ASN v2 включён и обновляет подписку без открытия приложения (renew/cancel/refund/revoke/expired).

---

## 7) Риски и “неприятные” места

1) Потребуется нативная разработка (Capacitor‑плагин на Swift) и дисциплина тестирования.
2) ASN v2 потребует строгой идемпотентности и дедупа (Apple может слать повторы).
3) Нужны права в App Store Connect (обычно Account Holder/Admin) для ключей и ASN настроек.
