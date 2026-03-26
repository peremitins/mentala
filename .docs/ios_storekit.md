# ТЗ: Разведение оплаты по регионам (RU → ЮKassa, WW → Apple IAP) + StoreKit 2

## Ключевые решения

- iOS 15+ only, StoreKit 2 only (без StoreKit 1, без `verifyReceipt`, без `cordova-plugin-purchase`)
- Legacy `NUXT_APPLE_IAP_SHARED_SECRET` удалён
- Signed transactions (JWS) + App Store Server API + ASN v2
- **Этап 1 (MVP):** StoreKit 2 purchase/restore + server confirm (JWS), без ASN v2
- **Этап 2:** ASN v2 для renew/cancel/refund/revoke без открытия приложения

---

## 1. Термины

- **Storefront** — регион App Store аккаунта (RU, DE, NL...)
- **RU-flow** — внешняя оплата (ЮKassa) через браузер
- **WW-flow** — Apple In-App Purchase (StoreKit 2)
- **billingProviderHint** — единственный переключатель flow в UI, приходит от backend

---

## 2. Определение региона

- Клиент получает `storefrontCountryCode` через нативный Capacitor-плагин (`Storefront.getStorefrontCountryCode()`)
- Кеш на клиенте: 24 часа (Preferences). По истечении TTL или re-login — перезапрос
- Клиент отправляет storefront на backend, backend возвращает `billingProviderHint`
- `yookassa` для RU, `apple_iap` для остальных и при неизвестном storefront (safe default)
- UI **не запускает оплату**, пока не получен `billingProviderHint` от backend

---

## 3. Capacitor-плагин (Swift, StoreKit 2)

Методы:
1. `getStorefrontCountryCode()` → `countryCode: string | null`
2. `getProducts(productIds)` → `productId`, `displayName`, `displayPrice`, `currencyCode`, `billingPeriod`
3. `purchase(productId, appAccountToken)` → verified `transactionId` + `signedTransactionInfo` (JWS)
4. `restore()` → `AppStore.sync()` + `Transaction.currentEntitlements` → verified транзакции
5. `getCurrentEntitlements()` (опционально, для быстрого UI)

Обязательно: `appAccountToken` (UUID) для привязки к пользователю Mentala.

Коды ошибок: `STOREKIT_UNAVAILABLE`, `PRODUCTS_LOAD_FAILED`, `PRODUCT_NOT_FOUND`, `PURCHASE_CANCELLED`, `PURCHASE_PENDING`, `PURCHASE_UNVERIFIED`, `SYNC_FAILED`, `UNKNOWN`

---

## 4. Runtime-требования StoreKit 2

- `Transaction.updates` listener при старте приложения / после логина
- Verified события → backend для reconcile; unverified → только лог
- `transaction.finish()` **только после** успешного `confirm` (`2xx`)
- При timeout/network error `confirm` → finish() запрещён, retry с backoff
- `purchaseInProgress` — блокировка double-tap

---

## 5. Экран Subscription

### Вход на экран:
1. Берём `storefrontCountryCode` (кеш или плагин)
2. Отправляем на backend
3. Получаем `billingProviderHint`, текущий план, статус, доступные планы

### RU-flow (`billingProviderHint = 'yookassa'`):
- Цены в рублях от backend (Pro: 349₽/мес, 3350₽/год; Premium: 649₽/мес, 6230₽/год)
- «Выбрать» → `POST /api/auth/external-session/create` → `consumeUrl` → внешний браузер → web checkout ЮKassa
- Показать подпись про внешний способ оплаты

### WW-flow (`billingProviderHint = 'apple_iap'`):
- Цены из StoreKit (`localizedPrice`), без подстановки "примерных" цен
- «Выбрать» → `purchase(productId, appAccountToken)` → `confirm` на backend
- Никаких редиректов и упоминаний "оплатите на сайте"

### Конфликт провайдеров (MVP):
- Параллельные подписки запрещены
- Активная YooKassa → блок Apple IAP + модалка
- Активная Apple → блок YooKassa checkout + модалка

---

## 6. API контракты

### 6.1 Confirm — `POST /api/subscriptions/apple/confirm`

Headers: `Idempotency-Key` (обязательно)

Body:
- `transactionId` (обязательно)
- `signedTransactionInfo` (обязательно, JWS)
- `appAccountToken` (рекомендуется)
- `storefrontCountryCode` (опционально, диагностика)

Ответ: `status`, `planId`, `billingPeriod`, `expiresAt`, `environment`

Правила:
- `originalTransactionId` извлекается сервером из JWS (не от клиента)
- Дедуп: `UNIQUE(transactionId)` или `UNIQUE(transactionId, environment)` в БД
- Ключ цепочки подписки: `originalTransactionId + environment`
- Upgrade/downgrade: тот же `originalTransactionId` + другой `productId` → обновление, не создание второй подписки

### 6.2 ASN v2 webhook (этап 2) — `POST /api/subscriptions/apple/notifications`

Body: `signedPayload` (JWS). Ответ: `200 OK` быстро, тяжёлое — в очередь.
- Дедуп по `notificationUUID`, идемпотентность по `originalTransactionId + environment`
- Обновляет подписку по renew/cancel/refund/revoke/expired

### 6.3 Restore/sync — `POST /api/subscriptions/apple/sync` (опционально)

Body: verified транзакции из `currentEntitlements`. Восстанавливает подписку при reinstall/new device.

### 6.4 Reconcile job (рекомендуется)

Ежедневная сверка через App Store Server API (`getTransactionHistory`). Идемпотентна.

---

## 7. Apple продукты (App Store Connect)

Одна subscription group: **Mentala Subscriptions**

| Product ID | Display Name |
|---|---|
| `mentala.pro.monthly` | Mentala Pro |
| `mentala.pro.yearly` | Mentala Pro |
| `mentala.premium.monthly` | Mentala Premium |
| `mentala.premium.yearly` | Mentala Premium |

Описания: Pro — "ИИ-чат до 100 минут в неделю, медитации и практики"; Premium — "Безлимитные ИИ-сессии и расширенные функции"

---

## 8. Env vars

Server-only (секреты):
- `APPLE_IAP_BUNDLE_IDS`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY_BASE64`
- Опционально: `APPLE_IAP_APPLE_ID` / `APPLE_IAP_APPLE_APP_ID`

Client: `NUXT_PUBLIC_APPLE_IAP_ENABLED` (feature-flag). Приватные ключи в `NUXT_PUBLIC_*` запрещены.

---

## 9. Требования Apple к UI подписок

- **Restore Purchases** — кнопка на Subscription screen (только для `apple_iap`, скрыта для `yookassa`)
- **Manage Subscription** — ссылка `https://apps.apple.com/account/subscriptions` (или `AppStore.showManageSubscriptions`), только для Apple IAP
- **Текст автопродления**: "Подписка автоматически продлевается, если не отменена минимум за 24 часа до окончания текущего периода"
- **Privacy Policy + Terms of Service** — кликабельные ссылки на paywall
- **Цена + период** — через StoreKit `localizedPrice`, без вручную заданных цен
- **Screenshot for Review** — экран тарифов с ценами
- **Grace Period**: 16 days, All renewals, Production + Sandbox

---

## 10. Тестирование (StoreKit Testing)

- Локальная конфигурация: `ios/App/Mentala.storekit` (4 subscriptions)
- Xcode Scheme → Run → Options → StoreKit Configuration: `Mentala.storekit` (локальное) или `None` (sandbox)
- Override storefront (Debug): env var `MENTALA_STOREFRONT_OVERRIDE` = `RU` | `DE` | `NONE`
- Локальные `.storekit` транзакции не проходят server-side верификацию — `confirm` должен работать в dev-only режиме
- Полный E2E: sandbox testers в App Store Connect (отдельные Apple ID)
- Минимальные E2E кейсы: purchase → confirm, renewal, cancel, refund/revoke

---

## 11. Критерии готовности

### MVP (этап 1):
1. RU-flow: рублёвые цены → внешний браузер → ЮKassa
2. WW-flow: StoreKit цены → Apple purchase → confirm
3. Flow выбирается по `billingProviderHint` от backend
4. `Transaction.updates` listener + `finish()` только после `confirm` 2xx
5. Retry `confirm` при timeout/network/5xx
6. Защита от double-tap, конфликт провайдеров, Privacy Policy + ToS на paywall
7. Restore восстанавливает подписку при reinstall/new device

### Этап 2:
1. ASN v2: renew/cancel/refund/revoke обновляются без открытия приложения
