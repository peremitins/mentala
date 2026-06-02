# ТЗ: iOS-подписки Mentala через Apple IAP без внешних ссылок

Дата ревизии: 2026-05-05.

## 1. Решение

Для ближайшего App Store Review Mentala должна показывать в native iOS только Apple In-App Purchase для тарифов Pro и Premium.

StoreKit External Purchase Link Entitlement (RU) сейчас не выдан. Поэтому в iOS-приложении нельзя показывать ссылки, кнопки, тексты, WebView, deep links или подсказки, которые направляют пользователя на оплату через сайт, YooKassa, Telegram, поддержку или любой другой внешний платежный канал.

Платформенная модель на этот этап:

| Платформа | Покупка/смена тарифа | Источник цены |
| --- | --- | --- |
| native iOS из App Store | Apple IAP / StoreKit 2 | StoreKit `displayPrice` |
| Web / PWA | YooKassa | `subscription_plans.base_price` в RUB |
| Android | YooKassa | `subscription_plans.base_price` в RUB |
| Backend | единый entitlement/status | `user_subscriptions` + feature access |

## 2. Почему это правильное решение

Да, решение показывать стандартное Apple purchase sheet правильное для ревью.

Причина:

- Mentala продает цифровой доступ к функциям внутри приложения.
- По App Review Guidelines 3.1.1 и 3.1.2 такой доступ в iOS должен продаваться через IAP, если внутри приложения есть покупка.
- Без StoreKit External Purchase Link Entitlement нельзя показывать внешнюю покупку или CTA на внешний способ оплаты.
- Если entitlement позже выдадут, внешний сценарий нужно делать отдельной фазой и только через разрешенный StoreKit External Purchase API.

Официальные источники Apple:

- App Review Guidelines 3.1.1 / 3.1.1(a): https://developer.apple.com/app-store/review/guidelines/
- StoreKit External Purchase API: https://developer.apple.com/documentation/StoreKit/external-purchase
- ExternalPurchaseLink: https://developer.apple.com/documentation/storekit/externalpurchaselink
- Auto-renewable subscriptions: https://developer.apple.com/app-store/subscriptions/
- App Store Connect subscription levels: https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information
- Subscription pricing: https://developer.apple.com/help/app-store-connect/manage-subscriptions/manage-pricing-for-auto-renewable-subscriptions
- First IAP/subscription submission: https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase

## 3. Ответ по России

Правильно понимать так:

1. Российские пользователи сейчас, скорее всего, не смогут надежно оплатить через Apple IAP из-за ограничений платежных методов Apple ID.
2. Несмотря на это, для App Store Review нужно показывать стандартную покупку Apple IAP, если в iOS-приложении есть экран покупки цифровой подписки.
3. Внутри iOS нельзя писать, что "для России оплатите на сайте", "если Apple не работает - оплатите через YooKassa" или давать ссылку на web.
4. Пользователь, который уже купил подписку через Web/PWA/Android, может войти в iOS и получить доступ через общий backend entitlement. В iOS не нужно объяснять, где именно он купил подписку.

Разрешенный iOS-текст при ошибке:

```text
Не удалось завершить покупку через Apple. Проверьте способ оплаты в Apple ID или попробуйте позже.
```

Запрещенный iOS-текст:

```text
Для пользователей из России оплата доступна на сайте.
```

```text
Перейдите на mentala.app для оплаты.
```

```text
Если Apple Pay не работает, оплатите через YooKassa.
```

## 4. Ответ по валютам и ценам

Если в App Store Connect базовая цена выбрана в долларах, это не означает, что все пользователи увидят доллары.

Для auto-renewable subscriptions Apple задает цену по storefront/country/region. App Store Connect может автоматически рассчитать сопоставимые цены для остальных стран и валют с учетом курса и налогов. Покупатель видит цену, которую StoreKit возвращает для его App Store storefront. Поэтому iOS-клиент должен показывать не нашу RUB-цену из базы, а только `displayPrice` из StoreKit.

Что нужно сделать в App Store Connect:

1. Для каждой из 4 подписок открыть `Subscription Prices`.
2. Проверить `View all Subscription Pricing` / `All Prices and Currencies`.
3. Убедиться, что для Russia storefront задана корректная цена в RUB, если Apple позволяет выбрать/сохранить цену для России.
4. Если базовая страна - США, это допустимо: Apple рассчитает локальные цены. Но для российского продукта лучше вручную проверить Russia price point, чтобы не получить случайную цену.
5. Не хардкодить в iOS рубли или доллары. В native iOS цена всегда берется из StoreKit.

Вывод: переделывать все подписки "в рубли" не обязательно, но обязательно проверить российский storefront в таблице всех цен. Если Apple показывает цену России в RUB, пользователь с российским App Store должен увидеть RUB. Если Apple не дает реально провести платеж, покупка может завершиться ошибкой, но приложение не должно предлагать внешний способ оплаты.

## 5. App Store Connect по скриншотам

Текущее состояние в целом близко к правильному:

- создана одна subscription group `Mentala Subscription`;
- в группе 4 auto-renewable subscriptions;
- Product IDs совпадают с кодом:
  - `mentala.premium.yearly`;
  - `mentala.premium.monthly`;
  - `mentala.pro.yearly`;
  - `mentala.pro.monthly`;
- статусы подписок - `Ready to Submit`;
- есть русская и английская локализации группы;
- у Premium Monthly есть локализации, описание, review screenshot, availability и tax category;
- первая подписка должна быть отправлена вместе с новой версией приложения, это соответствует подсказке App Store Connect и документации Apple.

Что нужно исправить/проверить перед отправкой:

1. Уровни подписок сейчас выглядят неверно.

   На скриншоте уровни идут так:

   | Текущий уровень | Подписка |
   | --- | --- |
   | 1 | Premium Yearly |
   | 2 | Premium Monthly |
   | 3 | Pro Yearly |
   | 4 | Pro Monthly |

   Для Apple это означает разные уровни сервиса, а не просто разные периоды. Месячная и годовая подписка одного тарифа дают одинаковый доступ, поэтому должны быть на одном уровне.

   Рекомендуемая структура:

   | Уровень | Подписки |
   | --- | --- |
   | 1 | Premium Monthly, Premium Yearly |
   | 2 | Pro Monthly, Pro Yearly |

   Premium выше Pro, потому что дает больше функций. Monthly и Yearly внутри одного плана - один уровень, потому что это crossgrade по длительности, а не upgrade/downgrade по ценности.

2. Проверить локализованные названия.

   На скриншоте русская локализация Premium Monthly визуально тоже называется `Premium Monthly`. Это не блокер само по себе, но для русской витрины лучше:

   | Product ID | RU display name |
   | --- | --- |
   | `mentala.pro.monthly` | Pro на месяц |
   | `mentala.pro.yearly` | Pro на год |
   | `mentala.premium.monthly` | Premium на месяц |
   | `mentala.premium.yearly` | Premium на год |

3. Проверить все 4 review screenshots.

   На третьем скриншоте screenshot есть у Premium Monthly. Аналогично должны быть заполнены остальные 3 подписки, если App Store Connect требует screenshot для `Ready to Submit`.

4. Проверить цены всех 4 подписок.

   На скриншоте цена свернута, поэтому по изображению нельзя подтвердить конкретные значения. Нужно открыть `All Prices and Currencies` и проверить минимум US/RU storefront.

5. Проверить Paid Apps Agreement.

   Если договор платных приложений в Tax and Banking не принят, платные IAP не будут нормально доступны для review/release.

6. Отправлять все 4 подписки вместе с новой iOS-версией.

   Для первой подписки Apple требует добавлять IAP/subscriptions в submission новой версии приложения. Если 4 подписки относятся к одной версии, лучше отправить все 4 сразу.

## 6. Фактическое состояние проекта

Уже есть:

- `shared/constants/appleIap.ts` - 4 Product ID, совпадают со скриншотами App Store Connect;
- `app/composables/useAppleIap.ts` - загрузка StoreKit-продуктов, покупка, restore, current entitlements, confirm retry queue;
- `ios/App/App/AppleIapPlugin.swift` - StoreKit 2 методы `getProducts`, `purchase`, `restore`, `getCurrentEntitlements`, `finishTransaction`, `showManageSubscriptions`;
- `server/api/subscriptions/apple/confirm.post.ts` - confirm endpoint с idempotency;
- `server/api/subscriptions/apple/notifications.post.ts` - App Store Server Notifications v2 ingest;
- `server/application/subscriptions/apple-iap.service.ts` - синхронизация Apple transaction в `user_subscriptions`;
- `server/infrastructure/db/schema.ts` - поля Apple IAP в `user_subscriptions`, таблицы `apple_transactions`, `apple_notification_events`;
- `users.apple_app_account_token` - стабильный `appAccountToken` для связки Apple transaction с аккаунтом Mentala;
- `subscription_plans` в локальной БД: `basic = 0`, `pro = 399`, `premium = 899`;
- Premium в entitlement-логике трактуется как `unlimited_fair_use`, несмотря на техническое значение `weekly_minutes_limit` в таблице.

Найденные противоречия до реализации:

1. `app/composables/useIosReviewBillingUi.ts` скрывал billing UI на native iOS полностью.

   Для новой фазы это изменено: native iOS больше не скрывает экран подписок, а promo/referral/web-payment surfaces скрываются отдельным флагом.

2. `server/api/subscriptions/current.get.ts` возвращал `billingProviderHint = yookassa` для iOS storefront `RU`.

   Для фазы без external entitlement native iOS всегда получает `apple_iap`, включая `RU`.

3. `server/api/subscriptions/storefront.post.ts` тоже возвращал `RU -> yookassa`.

   Для этой фазы endpoint продолжает сохранять storefront для аналитики/диагностики, но billing provider для native iOS остается `apple_iap`.

4. `app/pages/subscription.vue` содержал RU external checkout ветку:

   - `isIosYookassaFlow`;
   - `startIosExternalCheckout`;
   - `openExternalSubscriptionFlow`;
   - открытие внешнего браузера через `@capacitor/inappbrowser`;
   - external auth session для возврата в web-flow.

   В текущей фазе эта ветка удалена из достижимого native iOS сценария.

5. `ios/App/App/Info.plist` содержал `SKExternalPurchaseCustomLinkRegions`.

   Без выданного entitlement это лишний и рискованный след external purchase. Для текущей фазы ключ убран из release-конфигурации.

6. `.docs/arch_billing.md` описывал старое состояние, где native iOS скрывает `/subscription` и пишет про веб-версию.

   Документ обновлен: native iOS показывает `/subscription`, но без YooKassa/promo/referral payment controls.

## 7. Что не брать из stash

Контекстные stash/commit:

- `0bca50d57ea12d1568487b44600ee1228471ea77`;
- `49bc8254f6b0e4d7b44f5c4f6d0d2463b885416b`.

Вывод:

1. Оба stash были подготовкой под сценарий, где Apple выдаст External Purchase Link Entitlement для России.
2. Для текущей фазы без entitlement эти изменения нельзя применять как есть.
3. Особенно нельзя возвращать fallback на обычный `InAppBrowser`/Safari checkout из iOS. Это будет выглядеть как обход StoreKit.
4. Из `49bc...` можно позже переиспользовать идеи для external purchase token/intents и provider-switch guard, но только после выдачи entitlement.
5. Из текущей задачи external purchase schema и `SKExternalPurchaseLink` не нужны.

## 8. Требования к iOS UI

На native iOS:

1. Экран `/subscription` должен быть доступен.
2. Показываются тарифы Basic, Pro, Premium.
3. Basic не запускает покупку.
4. Pro/Premium запускают Apple IAP.
5. Цены Pro/Premium показываются только из StoreKit.
6. Если StoreKit не вернул продукт, конкретный тариф нельзя продавать как доступный.
7. Кнопка `Восстановить покупки` обязательна.
8. Кнопка управления подпиской должна открывать системное управление App Store subscriptions через `showManageSubscriptions`.
9. Promo/referral controls, YooKassa, web checkout, external auth checkout, ссылки на `mentala.app`/`my.mentala.app` для оплаты не показываются.
10. Ошибки покупки не содержат внешних платежных подсказок.

Допустимые тексты:

```text
Не удалось загрузить цены App Store. Попробуйте позже.
```

```text
Покупка отменена.
```

```text
Покупка ожидает подтверждения Apple.
```

```text
Покупки сейчас недоступны. Попробуйте позже.
```

```text
Подписка автоматически продлевается, если не отменена минимум за 24 часа до окончания текущего периода.
```

## 9. Требования к backend

Backend остается единым источником прав доступа.

Обязательные инварианты:

1. Клиент не решает сам, есть ли Pro/Premium доступ.
2. `GET /api/subscriptions/current` возвращает общий статус подписки, trial, entitlements и `billingProviderHint`.
3. `POST /api/subscriptions/apple/confirm` валидирует StoreKit transaction через App Store Server API в production.
4. `transaction.finish()` вызывается на клиенте только после успешного backend confirm.
5. `POST /api/subscriptions/apple/notifications` должен быть настроен в App Store Connect как App Store Server Notifications v2 URL.
6. Apple subscription renewal/cancel/refund/revoke синхронизируются через ASN v2 и/или receipt/current entitlements sync.
7. YooKassa-подписка, купленная на Web/PWA/Android, продолжает открывать доступ в iOS после авторизации.
8. Внутренние promo/referral mechanics остаются только для YooKassa-flow и не показываются для `apple_iap`.

Production env для Apple IAP:

```text
APPLE_IAP_BUNDLE_IDS=com.mentala.app
APPLE_IAP_ISSUER_ID=...
APPLE_IAP_KEY_ID=...
APPLE_IAP_PRIVATE_KEY_BASE64=...
```

## 10. Cross-provider защита

Нужно избегать двойного списания:

1. Если у пользователя уже активная YooKassa-подписка, iOS может показывать активный доступ, но не должен агрессивно принуждать к Apple IAP до окончания периода.
2. Если пользователь оформил Apple IAP, web/Android не должны запускать параллельную YooKassa-подписку, пока Apple auto-renew активен.
3. Если Apple auto-renew отключен, web/Android могут планировать переход на YooKassa после `endDate`, а не списывать немедленно.

Эта часть частично была проработана в stash `49bc...`; ее можно использовать как ориентир, но без external purchase части.

## 11. Реализационный план и статус

### 11.1. App Store Connect

1. Исправить уровни подписок:
   - Level 1: `Premium Monthly`, `Premium Yearly`;
   - Level 2: `Pro Monthly`, `Pro Yearly`.
2. Проверить Product IDs 1:1 с `shared/constants/appleIap.ts`.
3. Проверить локализации EN/RU для всех 4 продуктов.
4. Проверить review screenshots для всех 4 продуктов.
5. Проверить `All Prices and Currencies`, особенно Russia storefront.
6. Убедиться, что Paid Apps Agreement принят.
7. На странице новой версии iOS выбрать все 4 subscriptions в `In-App Purchases and Subscriptions`.
8. В App Review Notes написать, что iOS использует Apple IAP и не содержит external purchase links.

### 11.2. Frontend/native iOS

Статус: выполнено в кодовой базе.

1. `useIosReviewBillingUi` не скрывает весь `/subscription` на native iOS.
2. Native iOS provider hint равен `apple_iap` для всех storefront, включая `RU`.
3. Достижимая ветка `isIosYookassaFlow` для native iOS убрана.
4. Из native iOS UI убраны:
   - external checkout;
   - YooKassa widget/redirect;
   - external session checkout;
   - promo/referral controls;
   - тексты про web-оплату.
5. StoreKit price loading, purchase, restore, receipt sync оставлены.
6. `showManageSubscriptions` остается системным App Store subscriptions screen; fallback только на Apple subscriptions management URL, не на Mentala checkout.
7. `ios/App/Mentala.storekit` синхронизирован по уровням: Premium = level 1, Pro = level 2.
8. `SKExternalPurchaseCustomLinkRegions` убран из release `Info.plist` до получения entitlement.

### 11.3. Backend

Статус: выполнено в кодовой базе.

1. `resolveBillingProviderHint` в `server/api/subscriptions/current.get.ts` обновлен.
2. `server/api/subscriptions/storefront.post.ts` обновлен: storefront сохраняется, но не переключает native iOS на YooKassa.
3. `GET /api/subscriptions/current` на native iOS не запускает YooKassa maintenance/self-heal действия; web/Android сохраняют прежний контур.
4. Native iOS запросы к YooKassa payment-management endpoints получают контролируемую ошибку без payment URL.
5. Проверить production env Apple IAP.
6. Проверить idempotency и ownership conflict для Apple transactions.
7. Проверить ASN v2 endpoint и URL в App Store Connect.
8. Не менять API с breaking changes: старые web/Android клиенты должны продолжать работать.

### 11.4. Документация

Статус: `.docs/arch_billing.md`, `.docs/IOS_SETUP.md` и этот документ обновлены.

## 12. Тестирование

Минимальный чеклист:

1. `pnpm exec eslint` по измененным файлам.
2. `pnpm cap:sync:prod`.
3. Xcode StoreKit Configuration:
   - загрузка 4 продуктов;
   - покупка Pro Monthly;
   - покупка Premium Monthly;
   - restore;
   - смена Pro -> Premium;
   - смена monthly -> yearly внутри одного плана.
4. Sandbox/TestFlight:
   - StoreKit products возвращают локализованные цены;
   - purchase sheet открывается;
   - successful transaction подтверждается backend;
   - `user_subscriptions.payment_provider = apple_iap`;
   - `apple_transactions` содержит transaction;
   - restore работает после переустановки/повторного входа.
5. Negative checks на native iOS:
   - нет `mentala.app`/`my.mentala.app` purchase link;
   - нет YooKassa;
   - нет web checkout;
   - нет promo/referral CTA;
   - нет текста "оплатите на сайте";
   - RU storefront не переключает flow на YooKassa.
6. Regression checks Web/PWA/Android:
   - YooKassa checkout продолжает работать;
   - промокоды/referral остаются доступны только в YooKassa-flow;
   - активная Apple IAP подписка блокирует параллельный YooKassa checkout, пока auto-renew включен.

## 13. App Review Notes

Черновик:

```text
Mentala uses Apple In-App Purchase for Pro and Premium auto-renewable subscriptions in the iOS app.

The iOS app does not display external purchase links, website checkout links, YooKassa payment links, QR codes, or instructions to purchase digital subscriptions outside the app.

Users who already have an active subscription can sign in and access their subscription status through the app account. Subscription purchase and restore in the iOS app are handled through StoreKit.

Test account:
Email: ...
Password: ...

The following subscriptions are included in this submission:
- mentala.pro.monthly
- mentala.pro.yearly
- mentala.premium.monthly
- mentala.premium.yearly
```

Не писать в App Review Notes, что российские пользователи могут оплатить на сайте, если Apple-платеж не пройдет.

## 14. Acceptance criteria

Задача выполнена, если:

1. Native iOS показывает экран подписок.
2. Native iOS покупает Pro/Premium только через Apple IAP.
3. Native iOS не содержит внешних purchase links и web checkout.
4. RU storefront не включает YooKassa внутри iOS.
5. Все цены в iOS приходят из StoreKit.
6. Restore purchases работает.
7. Successful purchase синхронизируется с backend.
8. App Store Server Notifications v2 настроены или явно включены в чеклист release.
9. App Store Connect уровни подписок исправлены: Premium monthly/yearly на одном уровне, Pro monthly/yearly на одном уровне.
10. Все 4 subscriptions добавлены в submission новой iOS-версии.
11. Web/PWA/Android YooKassa-flow не сломан.
12. Документация архитектуры обновлена после реализации.
