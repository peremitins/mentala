Техническое задание: Разведение оплаты по регионам (Россия через ЮKassa, остальной мир через Apple In-App Purchase) с экраном управления подпиской

Ключевое решение (зафиксировано):
• Минимальная версия iOS: **iOS 15+**.
• WW-flow реализуем **только через StoreKit 2 (In‑App Purchase API)**, без двойной поддержки и без StoreKit 1.
• Legacy‑контур `verifyReceipt` + App‑Specific Shared Secret **удаляем** (в рамках перехода). Целевая схема: signed transactions (JWS) + App Store Server API + App Store Server Notifications v2 (ASN v2).

0. Контекст и цель

В приложении Mentala есть экран управления подпиской:
• Пользователь нажимает кнопку «Управлять подпиской».
• Открывается экран Subscription (внутренний экран приложения), где показано:
• текущий тариф и статус подписки,
• способ оплаты,
• список тарифов (Basic, Pro, Premium),
• переключатель периодов (месяц, год),
• кнопка «Выбрать» у конкретного тарифа.

Оплата должна работать по правилам Apple:
• Для пользователей с российским регионом App Store:
• оформление подписки через внешний сайт (ЮKassa),
• редирект происходит только после выбора тарифа и нажатия «Выбрать».
• Для пользователей с любыми другими регионами App Store:
• оформление подписки через Apple In-App Purchase (StoreKit),
• покупка запускается только после выбора тарифа и нажатия «Выбрать».

Ключевое требование: определять не физическую страну пользователя, а официальный регион App Store (Storefront), чтобы не ломалось при сценарии “App Store Германия, пользователь находится в России”.

⸻

1. Термины
   • Storefront - регион App Store аккаунта пользователя (страна магазина Apple ID), например RU, DE, NL.
   • RU-flow - внешняя оплата (ЮKassa) после выбора тарифа.
   • WW-flow - оплата через Apple In-App Purchase после выбора тарифа.

⸻

2. Источник правды для определения региона

2.1. Официальный способ определения региона для iOS

На iOS регион определяется через StoreKit storefront country code, а не через геолокацию и не через локаль устройства.

Требование:
• Клиент iOS должен получать storefrontCountryCode через нативный Capacitor-плагин.
• Минимальный контракт плагина:

- `Storefront.getStorefrontCountryCode(): Promise<{ countryCode: string | null }>`
- плагин читает storefront из StoreKit и возвращает нормализованный код страны в формате, который использует backend (`RU`, `DE`, ...), либо `null`, если storefront недоступен.
  • Этот код используется backend как входной сигнал для вычисления `billingProviderHint`.

Кеширование storefront на клиенте:
• storefrontCountryCode кешируется на 24 часа (например, в Preferences/локальном хранилище).
• Пока кеш свежий, экран Subscription использует кеш и не дёргает StoreKit повторно.
• После истечения TTL или при принудительном refresh (например, re-login) storefront запрашивается заново.

Правило:
• storefrontCountryCode используется как входной сигнал для backend.
• Финальный выбор провайдера делает backend и возвращает `billingProviderHint`.

Правило выбора flow в UI:
• `billingProviderHint === 'yookassa'` → RU-flow (внешняя оплата).
• `billingProviderHint === 'apple_iap'` → WW-flow (Apple In-App Purchase).

Безопасное поведение при ошибке получения storefront:
• Если storefront получить не удалось, backend возвращает `billingProviderHint='apple_iap'`, и UI включает WW-flow (Apple In-App Purchase), потому что показывать внешнюю оплату “на всякий случай” опаснее с точки зрения ревью Apple.

2.2. Синхронизация региона на бекенд

Требование:
• Клиент отправляет storefrontCountryCode на бекенд (например, при логине, открытии экрана Subscription, либо отдельным методом “sync device context”).
• Бекенд сохраняет storefrontCountryCode в профиле пользователя как billingRegionSource = 'storefront', billingStorefrontCountry = 'RU'|'DE'|..., billingStorefrontUpdatedAt.

Использование на бекенде:
• Бекенд в ответе на запрос Subscription возвращает поле billingProviderHint:
• yookassa для RU,
• apple_iap для остальных,
• apple_iap при неизвестном storefront.

Критичное правило:
• Даже если storefront известен на клиенте, UI не должен запускать оплату, пока не получен `billingProviderHint` от backend.
• При отсутствии storefront backend обязан вернуть `billingProviderHint='apple_iap'` (безопасный дефолт).

⸻

3. Поведение экрана Subscription

3.1. Вход в экран

При входе на экран Subscription клиент делает:

1. Берёт storefrontCountryCode из клиентского кеша (если кеш не старше 24 часов) или вызывает `Storefront.getStorefrontCountryCode()`.
2. Отправляет storefrontCountryCode на бекенд.
3. Запрашивает данные экрана Subscription:

   • текущий план,
   • статус подписки,
   • `billingProviderHint` (источник выбора платежного flow),
   • доступные планы,
   • цена и валюта для отображения (важно, смотри ниже).

3.2. Отображение цен

Россия (RU-flow)
• Цены показываются в рублях, из бекенда:
• Pro: 349 рублей в месяц, 3350 рублей в год
• Premium: 649 рублей в месяц, 6230 рублей в год
• Эти цены должны совпадать с реальными ценами на внешнем сайте.

Остальной мир (WW-flow)
• Цены показываются из Apple продуктов (StoreKit), в локализованном формате:
• localizedPrice (например, €5.99, $9.99)
• Клиент не должен вручную подставлять 5.99 или 9.99.
• Клиент должен загрузить продукты по идентификаторам и показать их цены.

Важно:
• Если StoreKit цены не загрузились, на экране показывается состояние загрузки или ошибка, но не подставляются “примерные” цены.

⸻

4. Логика нажатия кнопки «Выбрать»

На экране есть список тарифов (Pro, Premium) и периодов (месяц, год).
У каждого варианта есть кнопка «Выбрать».

4.1. RU-flow (`billingProviderHint = 'yookassa'`)

При нажатии «Выбрать» (актуально для текущей кодовой базы):

1. iOS-клиент открывает **внешний браузер** (не WebView) и переводит пользователя в web-версию Mentala на экран подписки.
2. Чтобы пользователь не логинился повторно, используется одноразовая external-session:
   - `POST /api/auth/external-session/create` → `consumeUrl`
   - `consumeUrl` открывается во внешнем браузере и создаёт web cookie-сессию.
3. Web-экран `/subscription` уже в браузере запускает текущий YooKassa checkout (`POST /api/subscriptions/start-checkout`) и доводит оплату до конца.
4. После оплаты YooKassa вызывает webhook, backend активирует подписку.
5. Пользователь возвращается в приложение, экран Subscription обновляет состояние по API.

Требование к UX:
• На экране Subscription должна быть понятная подпись про внешний способ оплаты только для RU-flow.

4.2. WW-flow (`billingProviderHint = 'apple_iap'`)

При нажатии «Выбрать»:

1. Клиент запускает покупку через **StoreKit 2 (In‑App Purchase API)** для выбранного продукта.
2. При покупке обязательно передаём `appAccountToken` (UUID, связанный с пользователем Mentala), чтобы упростить сверку транзакций и расследования.
3. После получения **verified** транзакции клиент подтверждает покупку на бекенде:
   - `POST /api/subscriptions/apple/confirm` + `Idempotency-Key`
   - payload: `transactionId` (обязательно), `signedTransactionInfo` (JWS, обязательно), `appAccountToken` (рекомендуется).
4. Бекенд валидирует signed transaction (JWS) и/или подтягивает детали через **App Store Server API**, затем отражает подписку в системе Mentala.

Требование:
• Для WW-flow не должно быть никаких редиректов на внешний сайт.
• Никаких упоминаний “оплатите на сайте” для WW-flow.
• Пока `purchase()` не завершился, кнопка “Выбрать” блокируется (`purchaseInProgress=true`), чтобы исключить double-tap и дублирующие покупки.

4.3. Обязательный runtime-listener StoreKit 2 (`Transaction.updates`)

Требование:
• iOS-клиент обязан поднимать долгоживущий listener `Transaction.updates` при старте приложения (или сразу после логина).
• Listener должен обрабатывать verified транзакции (renew/refund/revoke/upgrade/downgrade и др.) и отправлять их на backend для идемпотентной синхронизации.
• Для `unverified` транзакций backend-confirm не выполняем, событие логируем.

Критично:
• Без `Transaction.updates` часть изменений подписки будет потеряна между ручными sync/restore.

4.4. Завершение транзакций (`transaction.finish()`)

Требование:
• `await transaction.finish()` MUST вызываться только после успешного ответа `POST /api/subscriptions/apple/confirm` (`2xx`).
• Если backend недоступен/ошибка синхронизации — `finish()` не вызываем до успешного retry, чтобы не потерять событие.
• При timeout `confirm` (или неизвестном результате) `finish()` также запрещён до повторного успешного `confirm`.

4.5. Конфликт провайдеров (MVP-политика)

Проблема:
• Один и тот же пользователь может попытаться оформить Apple IAP, уже имея активную подписку YooKassa (через сайт).
• Или наоборот: пользователь с активной Apple-подпиской может попасть в RU-flow и попытаться оплатить через YooKassa.
• Это почти гарантированный сценарий “double charge” (двойное списание) и рост возвратов.

Решение для MVP:
• **Не разрешаем параллельные подписки.**
• Если у пользователя есть активная подписка YooKassa (`paymentProvider=yookassa`, `status=active`), то:

- кнопки “Выбрать” в Apple IAP paywall не запускают покупку,
- UI показывает объясняющую модалку: «у вас уже активна подписка на сайте, чтобы избежать двойного списания — дождитесь окончания/отмените автопродление, затем оформите через App Store».

• Если у пользователя есть активная Apple-подписка (`paymentProvider=apple_iap`, `status=active`), то в RU-flow:

- запуск YooKassa checkout блокируется,
- UI показывает объяснение: «у вас уже активна подписка через App Store; чтобы избежать двойного списания, дождитесь окончания или отмените автопродление в App Store».

  4.6. Retry-политика для `confirm` (обязательно)

Требование:
• Если `confirm` завершился сетевой ошибкой/timeout/`5xx`, клиент ставит транзакцию в retry-очередь.
• Retry выполняется идемпотентно (с тем же `transactionId`, `Idempotency-Key`) с backoff.
• Пока `confirm` не подтвердился, транзакция не завершается через `finish()`.

⸻

5. Набор Apple продуктов и структура в App Store Connect

5.1. Группы подписок

Нужно одна группа подписок.

Причина:
• Внутри одной группы Apple корректно поддерживает upgrade/downgrade между Pro и Premium, а также смену периода.

Рекомендованное имя группы:
• Mentala Subscriptions или Mentala Plans

Не надо называть группу “Mentala Premium”. Это реально звучит так, как будто у тебя один план.

5.2. Продукты внутри группы (4 штуки)
• mentala.pro.monthly
• mentala.pro.yearly
• mentala.premium.monthly
• mentala.premium.yearly

Локализация для каждого продукта:
• Display Name: Mentala Pro / Mentala Premium
• Description: короткая строка, смотри раздел 7

Цены:
• Проставляются в App Store Connect в долларах (или базовой валюте), Apple автоматически конвертирует в остальные валюты.

⸻

6. Обработка случаев “Германия App Store, пользователь в России”

Это ключевой сценарий, ради которого мы используем storefront.

Правило:
• Если storefrontCountryCode = DE, backend возвращает `billingProviderHint='apple_iap'`, и UI включает WW-flow (Apple).
• Даже если пользователь физически в России, все равно WW-flow.
• Ничего не ломается: Apple сама спишет с европейской карты.

Аналогично:
• Если storefrontCountryCode = RU, backend возвращает `billingProviderHint='yookassa'`, и UI включает RU-flow (ЮKassa), даже если пользователь физически в Европе.
• Это корректно с точки зрения правила “регион App Store определяет доступность оплаты”.

⸻

7. Тексты для поля “Описание” в локализации подписки (App Store Connect)

Ограничение: поле короткое, без маркетинговой простыни.

Mentala Pro (вариант)
• 100 минут ИИ-чата в неделю, медитации и практики

Mentala Premium (вариант)
• Безлимитные ИИ-сессии, свои практики и привычки

Если нужно более аккуратно:
• Pro: ИИ-чат до 100 минут в неделю, медитации и практики
• Premium: Безлимитные ИИ-сессии и расширенные функции

⸻

8. Требования к данным и API

8.1. API получения данных экрана Subscription

GET /api/subscriptions/current

Ответ:
• billingProviderHint: 'yookassa'|'apple_iap'
• storefrontCountry: 'RU'|'DE'|...|null
• currentPlan, currentPeriod, status, expiresAt
• планы и рублёвые цены (RU) — через `GET /api/subscriptions/plans`
• Apple productId зафиксированы в shared-константах (см. `shared/constants/appleIap.ts`), цены клиент загружает из StoreKit

Важно:
• UI выбирает flow оплаты только по `billingProviderHint`.
• `storefrontCountry` используется как диагностическое поле/контекст, но не как финальный переключатель оплаты.

8.2. API для RU-flow

POST /api/auth/external-session/create

Вход:
• redirectPath (включает выбранный `plan` и `billingPeriod`)
• appUrl (опционально, для device/LAN)

Выход:
• consumeUrl (URL для внешнего браузера)

8.3. API для WW-flow (Apple IAP confirm)

POST /api/subscriptions/apple/confirm

Headers:
• `Idempotency-Key` (обязательно)

Вход (body):
• `transactionId` (обязательно) — идентификатор транзакции StoreKit 2
• `signedTransactionInfo` (обязательно) — JWS (signed transaction) для server-side валидации без receipt
• `appAccountToken` (рекомендуется) — UUID пользователя Mentala для связывания транзакции и аудита
• `storefrontCountryCode` (опционально) — диагностический контекст с клиента; источник истины по факту покупки остаётся JWS

- Клиент берёт JWS из StoreKit 2 (`VerificationResult<Transaction>.jwsRepresentation` после успешной покупки).
- `originalTransactionId` всегда извлекается сервером из JWS/App Store Server API; клиентское значение не используется как источник истины.

Требования к хранению и идемпотентности на backend:
• Минимально сохраняем: `originalTransactionId`, `transactionId`, `productId`, `environment`, `purchaseDate`, `expiresAt`, `storefront`.
• `appAccountToken` сохраняем для расследований и корректной привязки при restore/reinstall сценариях.
• Ключ цепочки подписки: `originalTransactionId + environment`.
• Дедуп отдельных покупок/продлений: `transactionId`.
• Повторный `confirm` с теми же данными должен быть идемпотентным (без создания дубликатов подписки).
• Защита от replay-атак: на уровне БД обязателен unique-инвариант для транзакции (`transactionId` или `transactionId + environment`).
• При timeout/сетевой ошибке `confirm` клиент обязан повторить запрос; до успешного `confirm` вызов `finish()` запрещён.

Требования к upgrade/downgrade в одной subscription group:
• Если приходит новая verified транзакция с тем же `originalTransactionId` и другим `productId`, backend обновляет план текущей подписки (а не создаёт независимую вторую подписку).
• Флаги `isUpgraded` и связанные поля StoreKit 2 учитываются при вычислении актуального entitlements-состояния.

Выход:
• status: 'active'|'none'
• planId, billingPeriod, expiresAt, environment

8.4. Таблица аудита Apple-транзакций (рекомендуется)

Рекомендуется завести отдельную таблицу `apple_transactions` для аудита и расследований:
• `id`
• `originalTransactionId`
• `transactionId`
• `productId`
• `environment`
• `purchaseDate`
• `expiresDate`
• `revocationDate`
• `signedPayload` (или digest + ссылка на сырой payload)
• `createdAt`

Назначение:
• быстрый аудит спорных кейсов (refund/chargeback),
• прозрачный трейс reconcile/ASN-обработки,
• диагностика дублей и replay-событий.

8.5. ASN v2 (App Store Server Notifications v2) — этап 2 (сразу после первого стабильного релиза)

POST /api/subscriptions/apple/notifications

Вход (body):
• `signedPayload` (обязательно) — JWS payload от Apple (ASN v2)

Примечание:
• Для MVP допускается старт без ASN v2 (если нужно быстрее пройти первый релиз), но тогда изменения статуса подписки (renew/cancel/refund) гарантированно подтянутся только при синхронизации из приложения.

Требования:

1. Backend обязан валидировать подпись `signedPayload` (JWS) по публичным ключам Apple.
2. Backend обязан проверять `bundleId`/`appAppleId`/`environment` и соответствие нашим productId.
3. Обработка должна быть идемпотентной:
   • дедуп по `notificationUUID` (или эквивалентному идентификатору из payload),
   • все апдейты подписки должны быть идемпотентны по `originalTransactionId`,
   • защита от повторной доставки и переупорядочивания уведомлений.
4. На события (renew/cancel/refund/revoke/expired) подписка в Mentala должна обновляться без участия клиента.
5. Ответ Apple должен быть быстрым (без долгих операций в request‑треде): тяжёлую работу выносить в фон/очередь.

8.6. Плановый reconcile job (рекомендуется)

Требование:
• На backend запускается регулярная сверка (например, 1 раз в сутки) через App Store Server API (`getTransactionHistory` и related endpoints).
• Цель сверки: найти пропущенные renew/refund/revoke/cancel события и выровнять состояние подписок.
• Reconcile job идемпотентен и безопасен к повторному запуску.

⸻

9. Критерии готовности (Acceptance Criteria)

9.1. MVP (первый релиз, допускается без ASN v2)

1.  Пользователь с App Store RU видит на экране Subscription рублёвые цены и при нажатии “Выбрать” уходит на ЮKassa во внешний браузер.
2.  Пользователь с App Store DE (или любой не RU) видит цены из Apple (локализованные) и при нажатии “Выбрать” запускает Apple покупку.
3.  UI выбирает flow только по `billingProviderHint` от backend; storefront на клиенте используется только как входной сигнал для backend.
4.  Если storefront не получен, backend возвращает `billingProviderHint='apple_iap'`, приложение не показывает внешнюю оплату и не делает редирект.
5.  В приложении работает `Transaction.updates` listener и синхронизирует verified события подписки на backend.
6.  `transaction.finish()` вызывается только после успешного `confirm` (`2xx`), при timeout/ошибке `confirm` `finish()` не вызывается.
7.  При ошибке/timeout `confirm` клиент выполняет идемпотентный retry до успешного завершения.
8.  В WW-flow кнопка покупки защищена от double-tap (повторный tap не запускает второй `purchase()` до завершения первого).
9.  На paywall присутствуют кликабельные ссылки Privacy Policy и Terms of Service.
10. При restore кейс “entitlement есть, а backend не знает подписку” корректно восстанавливает подписку через confirm/reconcile.
11. При активной подписке YooKassa покупка Apple IAP блокируется (MVP), чтобы исключить двойные списания.
12. При активной Apple-подписке запуск YooKassa checkout блокируется (MVP), чтобы исключить двойные списания.
13. Внутри приложения не появляется внешний линк оплаты для WW-flow ни в каком виде.
14. Экран “Управлять подпиской” всегда ведет сначала на экран Subscription, редирект или покупка происходят только после выбора тарифа и кнопки “Выбрать”.
15. Без ASN v2 состояние Apple подписки должно регулярно подтягиваться при открытии приложения/экрана Subscription (restore/sync), чтобы продления отражались хотя бы при активности пользователя.

9.2. Этап 2 (надёжность)

1.  ASN v2 подключён: продления/отмены/рефанды/ревоки отражаются на backend без открытия приложения.

⸻

10. Задачи для разработки

10.1. iOS клиент
• Реализовать получение storefrontCountryCode через StoreKit (нативный Capacitor-плагин `getStorefrontCountryCode()`).
• Добавить кеш storefrontCountryCode на клиенте (TTL 24 часа).
• Передавать storefront на бекенд.
• На экране Subscription:
• RU-flow: показывать цены из бекенда, запускать внешний checkout.
• WW-flow: загружать StoreKit продукты и показывать localizedPrice, запускать покупку.
• Запускать долгоживущий `Transaction.updates` listener и отправлять verified события на backend.
• Вызывать `transaction.finish()` только после успешного `confirm` (`2xx`); при timeout/ошибке `confirm` — не вызывать.
• Реализовать retry-очередь для `confirm` (timeout/network/5xx) с backoff.
• Защитить кнопку покупки от double-tap (`purchaseInProgress`/disable state).

10.2. Бекенд
• Хранить storefront в профиле пользователя.
• Возвращать billingProviderHint для UI.
• RU-flow: поддержать внешний переход через существующий external-session (без повторного логина) и текущий web checkout (YooKassa).
• Обновлять подписку по вебхукам ЮKassa.
• Для Apple покупок (StoreKit 2):
• валидировать **signed transactions (JWS)** на backend,
• хранить `originalTransactionId` (ключ цепочки) + `transactionId` (дедуп) + `environment` + `expiresAt`,
• хранить `purchaseDate` + `storefront` для аудита,
• хранить `appAccountToken` (если присутствует в JWS/пейлоаде) для корректного user-linking,
• при необходимости подтягивать детали через **App Store Server API**,
• принимать и обрабатывать **App Store Server Notifications v2 (ASN v2)** (renew/cancel/refund/chargeback),
• обеспечить идемпотентность ASN v2 (дедуп `notificationUUID`, обработка повторов/переупорядочивания),
• учесть upgrade/downgrade внутри subscription group (обновление по `originalTransactionId`, а не создание второй подписки),
• добавить уникальный DB-инвариант для транзакций Apple (`transactionId` или `transactionId + environment`) как защиту от replay,
• извлекать `originalTransactionId` только на сервере из JWS/App Store Server API (клиентское значение не использовать как источник истины),
• запустить ежедневный reconcile job через App Store Server API (`getTransactionHistory`) для страховки от пропущенных событий,
• отражать подписку в нашей системе (4 продукта Pro/Premium month/year).

⸻

11. Решения, которые фиксируем для команды (StoreKit 2 only)

1) Минимальная iOS: **15+**. Поддержки iOS 13/14 и StoreKit 1 нет.
2) WW-flow: **StoreKit 2** + server-side проверка signed transactions, без `verifyReceipt` и без shared secret.
3) Обязательный runtime StoreKit 2: `Transaction.updates` listener + `transaction.finish()` только после успешного `confirm`.
4) **ASN v2**:
   • целевая архитектура включает ASN v2 обязательно (иначе доступ будет обновляться только при открытии приложения),
   • допускается сделать короткий этап “без ASN v2” только если это ускоряет первый релиз, но после релиза ASN v2 должен быть следующим приоритетом.

---

12. Требования Apple к UI подписок (обязательные элементы для прохождения ревью)

Apple проверяет не только техническую интеграцию StoreKit, но и интерфейс экрана подписки. Отсутствие этих элементов является одной из самых частых причин отклонения приложения.

12.1. Кнопка «Восстановить покупки» (Restore Purchases)

Требование Apple (App Store Review Guidelines 3.1.1):

Если пользователь ранее купил подписку на другом устройстве или после переустановки приложения, он должен иметь возможность восстановить покупки.

Поэтому в интерфейсе должна присутствовать кнопка:

• «Восстановить покупки»
или
• Restore Purchases

Техническая реализация:

Кнопка должна вызывать синхронизацию покупок через StoreKit.

StoreKit 2:

AppStore.sync()

Поведение:

1. Клиент вызывает `AppStore.sync()` (инициирует синхронизацию c App Store).
2. После `sync()` клиент читает актуальные entitlements через `Transaction.currentEntitlements`.
3. Клиент отправляет на backend текущие verified транзакции/`signedTransactionInfo` для reconcile.
4. Backend идемпотентно обновляет подписку в Mentala.
5. Если entitlement найден, но backend не видит активную подписку (новое устройство / reinstall / потерянная локальная запись), запускается принудительный `confirm/reconcile` по найденным транзакциям.

Важно:
• `AppStore.sync()` сам по себе не возвращает “готовый список покупок в ответе” для UI. Список нужно читать отдельно через entitlements API.

Где должна находиться кнопка:

• на экране paywall
или
• на экране управления подпиской (Subscription screen)

В проекте Mentala кнопка должна находиться на экране:

Управление подпиской → Subscription screen.

12.2. Скрытие кнопки Restore Purchases для RU-flow

В Mentala используется гибридная схема оплаты:

• Россия → внешняя оплата через ЮKassa
• Остальной мир → Apple In-App Purchase

Поэтому кнопку Restore Purchases необходимо показывать только для Apple-покупок.

Правило:

if billingProviderHint == 'apple_iap'
показываем кнопку Restore Purchases

if billingProviderHint == 'yookassa'
кнопку Restore Purchases НЕ показываем

Причина:

Apple может отклонить приложение, если пользователь оплачивает через внешний платежный провайдер, но интерфейс предлагает "восстановить покупки" Apple.

12.3. Ссылка на управление подпиской Apple

Apple требует, чтобы пользователь мог легко отменить подписку.

В интерфейсе должна быть ссылка:

https://apps.apple.com/account/subscriptions

В UI это может быть кнопка:

• «Управление подпиской в App Store»
или
• Manage Subscription

Эта ссылка открывает системную страницу управления подписками Apple.

Важно:

Эта ссылка показывается только для Apple IAP.

Рекомендуемая реализация:
• Базовый fallback для всех поддерживаемых iOS: открывать URL `https://apps.apple.com/account/subscriptions`.
• Если доступен нативный вызов StoreKit 2, можно показывать системный sheet через `AppStore.showManageSubscriptions(in:)`.
• При ошибке нативного вызова обязательно fallback на URL.

12.4. Текст автообновления подписки

Apple требует явного уведомления пользователя о том, что подписка автоматически продлевается.

На экране подписки должен присутствовать текст, например:

«Подписка автоматически продлевается, если не отменена минимум за 24 часа до окончания текущего периода.»

или

"Subscription renews automatically unless cancelled at least 24 hours before the end of the current period."

Этот текст должен находиться на экране paywall или Subscription screen.

12.5. Обязательные юридические ссылки на paywall

Для auto-renewable subscriptions в paywall обязательно показываем:
• ссылку на Privacy Policy
• ссылку на Terms of Service (EULA/Terms)

Требование:
• ссылки должны быть кликабельными и вести на публично доступные страницы.
• размещать ссылки нужно на самом экране paywall/подписки, а не только в Settings.

12.6. Отображение цены и периода

Ревью Apple проверяет, что пользователь ясно понимает:

• цену
• период подписки

На карточках тарифов должны отображаться:

• цена (например: 349 ₽ / месяц)
• период (месяц / год)

Для Apple IAP цена должна отображаться через StoreKit localizedPrice.

Нельзя показывать приблизительные или вручную заданные цены для Apple подписок.

12.7. Скриншот для ревью подписки

Каждая подписка в App Store Connect должна иметь Screenshot for Review.

Скриншот должен показывать:

• экран тарифов
• кнопку выбора тарифа
• цену

Для Mentala рекомендуется использовать экран с карточками тарифов (Basic / Pro / Premium).

12.8. Review Notes для подписок

В каждой подписке рекомендуется заполнить поле Review Notes, чтобы ускорить проверку.

Рекомендуемый текст:

"Subscriptions are available on the Manage Subscription screen inside the app.

User flow:
Settings → Manage Subscription → choose plan → purchase."

12.9. Льготный платежный период (Grace Period)

Рекомендуемая конфигурация:

Продолжительность:

16 days

Правомочные подписки:

All renewals

Серверная среда:

Production and Sandbox

Причина:

Grace Period позволяет Apple повторно попытаться списать средства при временных проблемах с картой пользователя. Это снижает churn подписчиков и является стандартной практикой для consumer SaaS приложений.

Если платеж не восстановится, Apple автоматически отменяет подписку и доход не начисляется.

---

13. Разработка и тестирование (StoreKit Testing / Mentala.storekit)

13.1. Почему сейчас «цены не подтягиваются»

Если в App Store Connect у подписок статус **«Метаданные отсутствуют»**, StoreKit часто возвращает продукты как invalid (`Product not found`), из‑за чего:

• цены не приходят,  
• paywall не может показать локализованные стоимости.

13.2. Как тестировать до полного оформления в App Store Connect

В репозитории есть локальная конфигурация StoreKit:

• `ios/App/Mentala.storekit` — 4 auto‑renewable subscriptions:  
 • `mentala.pro.monthly`  
 • `mentala.pro.yearly`  
 • `mentala.premium.monthly`  
 • `mentala.premium.yearly`

Чтобы использовать её на девайсе/симуляторе, включи StoreKit Configuration в Xcode Scheme:

• Scheme `App` — единственная схема запуска приложения.  
В ней переключаем `StoreKit Configuration` вручную:
• `Mentala.storekit` — локальное StoreKit Testing  
• `None` — реальные sandbox‑продукты из App Store Connect

13.3. Переключение режима

Самый быстрый способ переключения — просто выбрать нужную схему в верхней панели Xcode (Scheme selector).

Если хочешь сделать вручную в одной схеме:

• Scheme → Edit Scheme → Run → Options → StoreKit Configuration  
• Выбрать `Mentala.storekit` или `None`

13.4. Тест RU/WW без смены Apple ID (override storefront)

Для разработки можно принудительно подменить storefront (только Debug) через env var в Xcode Scheme:

• `MENTALA_STOREFRONT_OVERRIDE=RU` — форсирует RU-flow (внешняя оплата)  
• `MENTALA_STOREFRONT_OVERRIDE=DE` — форсирует WW-flow (Apple IAP)  
• `MENTALA_STOREFRONT_OVERRIDE=NONE` — вернёт storefront как `null` (проверка safe‑fallback)

13.5. Важное ограничение

Покупки из StoreKit Testing (`.storekit`) живут в локальном тестовом контуре Xcode и могут **не проходить** server‑side подтверждение (ни через App Store Server API, ни через ASN v2), потому что на серверах Apple таких транзакций может не существовать.

В режиме `.storekit`:
• `POST /api/subscriptions/apple/confirm` должен быть отключён или работать в dev-only режиме без App Store Server API.
• Иначе получим ложные ошибки в логах и шум в мониторинге.

Для полноценного E2E (purchase → confirm → выдача entitlements на backend → продления/рефанды через ASN v2) нужно, чтобы подписки в App Store Connect были полностью оформлены и тестировались через sandbox.

13.6. Sandbox testers и обязательные E2E сценарии

Настройка:
• App Store Connect → Users and Access → Sandbox Testers.
• Для тестов на реальном sandbox-окружении используем отдельные тестовые Apple ID (не personal Apple ID команды).

Минимальный набор E2E кейсов:

1. purchase (новая подписка) → confirm → доступ активирован.
2. renewal (автопродление в sandbox) → статус/expiry обновились на backend.
3. cancel (отмена автопродления) → корректный статус после окончания периода.
4. refund/revoke (через sandbox инструменты Apple) → доступ снят, статус обновился.
