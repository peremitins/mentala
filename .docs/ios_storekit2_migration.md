# Миграция на StoreKit 2 (iOS 15+) + Server API + ASN v2

## Решения

- iOS 15+, StoreKit 2 only
- **Этап 1 (MVP):** StoreKit 2 purchase/restore + server confirm (JWS), без ASN v2
- **Этап 2:** ASN v2 (renew/cancel/refund/revoke без открытия приложения)
- Удаляем: `cordova-plugin-purchase`, `verifyReceipt`, `NUXT_APPLE_IAP_SHARED_SECRET`

---

## 1. Что удаляем (legacy)

**Клиент:** `cordova-plugin-purchase`, `window.CdvPurchase`, `store.initialize`, `receiptBase64`
**Backend:** `verifyReceipt` client, shared secret код/конфиги
**Env:** `NUXT_APPLE_IAP_SHARED_SECRET`

---

## 2. Capacitor-плагин (Swift)

| Метод | Назначение |
|---|---|
| `getStorefrontCountryCode()` | `countryCode` или `null` |
| `getProducts(productIds)` | `productId`, `displayName`, `displayPrice`, `currencyCode`, `billingPeriod` |
| `purchase(productId, appAccountToken)` | Verified `transactionId` + `signedTransactionInfo` (JWS) |
| `restore()` | `AppStore.sync()` → `Transaction.currentEntitlements` |

Обязательно: `appAccountToken` (UUID) для привязки к пользователю.

Коды ошибок: `STOREKIT_UNAVAILABLE`, `PRODUCTS_LOAD_FAILED`, `PRODUCT_NOT_FOUND`, `PURCHASE_CANCELLED`, `PURCHASE_PENDING`, `PURCHASE_UNVERIFIED`, `SYNC_FAILED`, `UNKNOWN`

---

## 3. Runtime-требования

- `Transaction.updates` listener при старте / после логина
- `transaction.finish()` **только после** `confirm` 2xx
- При timeout/network error → finish() запрещён, retry с backoff (персистентная очередь)
- `purchaseInProgress` блокировка double-tap

---

## 4. Backend (Server API)

### Confirm — `POST /api/subscriptions/apple/confirm`

Headers: `Idempotency-Key`
Body: `transactionId`, `signedTransactionInfo` (JWS), `appAccountToken`, `storefrontCountryCode`
Ответ: `status`, `planId`, `billingPeriod`, `expiresAt`, `environment`

- `originalTransactionId` извлекается из JWS на сервере (не от клиента)
- Дедуп: `UNIQUE(transactionId)` в БД, ключ цепочки: `originalTransactionId + environment`
- Upgrade/downgrade: тот же `originalTransactionId` + другой `productId` → обновление текущей подписки

### ASN v2 (этап 2) — `POST /api/subscriptions/apple/notifications`

Body: `signedPayload` (JWS). Ответ: `200 OK` быстро, тяжёлое — в очередь.
- Дедуп по `notificationUUID`, идемпотентность по `originalTransactionId + environment`

### Reconcile job (рекомендуется)

Ежедневная сверка через App Store Server API (`getTransactionHistory`). Идемпотентна.

---

## 5. Env vars

Server-only: `APPLE_IAP_BUNDLE_IDS`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY_BASE64`
Опционально: `APPLE_IAP_APPLE_ID`, `APPLE_IAP_APPLE_APP_ID`
Client: `NUXT_PUBLIC_APPLE_IAP_ENABLED` (feature-flag)

---

## 6. App Store Connect

- Одна subscription group: **Mentala Subscriptions**
- Продукты: `mentala.pro.monthly`, `mentala.pro.yearly`, `mentala.premium.monthly`, `mentala.premium.yearly`
- In-App Purchase key (Issuer ID / Key ID / `.p8`) для App Store Server API
- ASN v2 URL (этап 2)
- Sandbox testers для E2E

---

## 7. Критерии готовности

### Этап 1 (MVP):
1. Нет `cordova-plugin-purchase`, `window.CdvPurchase`, `verifyReceipt`, shared secret
2. Purchase/restore через StoreKit 2, confirm через JWS
3. `Transaction.updates` listener + `finish()` только после confirm 2xx
4. Retry confirm при timeout/network/5xx
5. Privacy Policy + Terms of Service на paywall

### Этап 2:
1. ASN v2: renew/cancel/refund/revoke обновляются без открытия приложения

---

## 8. Риски

1. Нативная разработка Capacitor-плагина (Swift) + дисциплина тестирования
2. ASN v2: строгая идемпотентность и дедуп (Apple шлёт повторы)
3. Нужны права Account Holder/Admin в App Store Connect для ключей и ASN
