## ТЗ: Интеграция платежной системы ЮKassa в проект Mentala

### 1. Общая концепция

- **Стек:** Nuxt 4 (Frontend), Nitro (Backend/API).
- **Метод оплаты:** ЮKassa Виджет (Checkout.js).
- **Целевые платформы:**
  - **Web & Android:** полная интеграция виджета внутри интерфейса.
  - **iOS (RU storefront):** внешний системный браузер → web checkout (ЮKassa).
  - **iOS (WW storefront):** **Apple In‑App Purchase (StoreKit 2)** внутри приложения (ЮKassa не используется) — см. `.docs/ios_storekit.md`.

---

### 2. Логика по платформам

| Платформа   | Место оплаты        | Метод        | Особенности                                                   |
| ----------- | ------------------- | ------------ | ------------------------------------------------------------- |
| **Web**     | Внутри сайта        | Виджет       | Модальное окно поверх интерфейса.                             |
| **Android** | Внутри приложения   | Виджет       | Загружается в WebView (или Capacitor Browser).                |
| **iOS (RU)** | **Внешний браузер** | Веб-страница | **Запрещено** использовать WebView. Только системный браузер. |
| **iOS (WW)** | Внутри приложения | Apple IAP | StoreKit 2, цены только из StoreKit, без внешних оплат. |

---

### 3. Backend (Nitro API)

Текущая интеграция в проекте использует следующие маршруты:

1. **`POST /api/subscriptions/start-checkout`**:

- Принимает: `planId`, `billingPeriod`, `paymentMode`, `externalFlow`.
- Обязателен `Idempotency-Key`.
- Возвращает один из `checkoutAction`:
  - `payment` (нужно открыть YooKassa),
  - `activated` (активировано без платежа),
  - `scheduled_downgrade`,
  - `noop`.

2. **`POST /api/payments/yookassa/webhook`**:

- Принимает: webhook от YooKassa.
- Проверяет платеж через API YooKassa.
- Синхронизирует локальный статус подписки/оплаты.

3. **`GET /api/subscriptions/current`**:

- Возвращает актуальное состояние подписки/trial/scheduled change для UI.

4. **`GET /api/subscriptions/check-payment-status`**:

- Polling/reconcile endpoint для подтверждения финального статуса платежа.

---

### 4. Frontend (Nuxt 4)

#### А. Определение платформы

`usePlatform` уже используется в текущем коде. Для iOS native checkout внутри приложения не открывается.

#### Б. Компонент оплаты (Web & Android)

Инициализация скрипта `https://yookassa.ru/checkout-widget/v1/checkout-widget.js`.

- При клике «Купить» вызывается `POST /api/subscriptions/start-checkout`.
- Виджет рендерится в выделенный контейнер внутри нашего `Dialog`.
- Используется режим `customization.modal = false` (контейнерный рендер).

#### В. Логика для iOS (Управление подпиской)

В разделе «Настройки» кнопка **«Управление подпиской»**:

- **Если iOS native и storefront = RU:** используется внешний браузер через flow внешней web-сессии (ЮKassa).
  - Технически: backend-команда создания external-session и переход на одноразовый `consumeUrl`.
  - Пользователь не должен проходить повторную ручную авторизацию.
- **Если storefront != RU:** никакого внешнего браузера для оплаты — покупка выполняется через **Apple In‑App Purchase (StoreKit 2)** (см. `.docs/ios_storekit.md`).

---

### 5. Ответ на вопрос про Safari и внешний браузер (только RU-flow)

**Нужен ли именно Safari?**
Нет, не обязательно именно Safari. Важно, чтобы это был **системный браузер по умолчанию**.

- Если у пользователя по умолчанию стоит Chrome или «Яндекс», ссылка откроется там.
- **Главное условие Apple:** Вы должны совершить переход из вашего приложения в приложение-браузер (это называется _Out-of-app purchase flow_).

**Почему нельзя WebView на iOS?**
Apple считает WebView частью вашего приложения. Если вы берете деньги за цифровой контент внутри WebView, они видят в этом попытку скрыть транзакцию от их комиссии. Это ведет к **удалению приложения из App Store**. Использование внешнего браузера юридически выводит процесс оплаты за рамки «внутриигровых покупок».

---

### 6. Рекомендации по UX для iOS (чтобы пройти модерацию)

**RU storefront (внешняя оплата):**

1. **Текст на кнопке:** вместо «Купить Premium за 499р» используйте «Управление подпиской» / «Личный кабинет».
2. **Информационное сообщение:** рядом с CTA можно написать: _«Оплата и управление подпиской доступны на сайте»_ (без сравнений и “дешевле на сайте”).
3. **Цены:** если показываем цены — делаем это нейтрально и без стиринга (см. `.docs/ios_storekit.md`), редирект только после выбора тарифа.

**WW storefront (Apple IAP):**

1. Цены на карточках — только из StoreKit (localized price), без хардкода.
2. В интерфейсе обязательны: Restore Purchases + ссылка на управление подпиской Apple + текст про автопродление (см. `.docs/ios_storekit.md`).

---

### Уточняющие вопросы к тебе:

1. **Авторизация:** Как пользователь будет авторизован на сайте после перехода из iOS-приложения? (Например: мы можем передать временный токен в URL или попросить пользователя войти по Email/OTP заново).
2. **База данных:** Готова ли у тебя структура в БД для хранения `paymentId` и статуса подписки, чтобы Webhook мог найти нужного юзера?

мои ответы:

1. **Авторизация:** Нужно чтобы юзеру не нужно было заново авторизовываться и мучать его, нужно автоматически производить авторизацию на вебе, на основе авторизации в приложении.
2. **База данных:** проверь эту информацию!

=============
Дополнение к ТЗ (ревизия под текущий код Mentala, 20.02.2026):

Техническое задание: Апгрейд тарифа во время Trial без немедленного списания

### 1. Контекст текущей реализации (as-is)

Ниже зафиксировано, как работает сейчас, чтобы новое ТЗ не конфликтовало с кодом:

1. Текущий checkout-эндпоинт: `POST /api/subscriptions/start-checkout` (а не `/api/payments/create`).
2. Webhook: `POST /api/payments/yookassa/webhook`.
3. Trial сейчас хранится в `users.trialEndedAt`, а не в отдельной trial-подписке.
4. При успешной оплате платного плана trial завершается сразу (`trialEndedAt = now`).
5. Сейчас при выборе Pro/Premium в Trial платеж создается сразу (немедленное списание).
6. Автосписание на конец периода в YooKassa еще не реализовано (есть только локальный `autoRenew` флаг и TODO в cancel handler).
7. В модели данных нет явного сохранения `payment_method_id` для рекуррентных списаний.

Это дополнение меняет именно пункт 5: для Trial нужен режим "списание в конце Trial".

---

### 2. Цель

Если у пользователя активен Trial 7 дней и он выбирает Pro или Premium до окончания Trial, то:

1. Доступ к выбранному платному тарифу включается сразу.
2. Первое списание выполняется строго в `TrialEndsAt`.
3. До `TrialEndsAt` немедленного списания нет.

---

### 3. Термины (в терминах текущего проекта)

1. `trialActive`: вычисляется как `users.trialEndedAt > now`.
2. `trialEndsAt`: `users.trialEndedAt`.
3. `currentEntitlementsPlan`: эффективный план доступов для UI/API (basic/pro/premium).
4. `billingPlan`: выбранный для будущего списания план (null/pro/premium).
5. `billingPeriod`: период будущего списания (`month`/`year`).
6. `nextChargeAt`: дата ближайшего планового списания.
7. `paymentMethodBound`: есть ли валидный сохраненный метод оплаты для рекуррента.
8. `billingCollectionStatus`: операционный статус списания (`none` | `scheduled` | `past_due`).
9. `graceEndsAt`: дата окончания льготного окна для `past_due` (`datetime | null`).

Важно: не смешивать это с `user_subscriptions.paymentStatus` (`active/pending/expired/canceled`), чтобы не ломать текущую доменную модель подписок.
`past_due` в этом ТЗ означает: платеж не прошел, идет grace period, доступы управляются отдельной policy.

---

### 4. Бизнес-правила

#### BR-0. Единое правило вычисления `currentEntitlementsPlan`

Приоритет вычисления:

1. Если `billingCollectionStatus = past_due` и `now >= graceEndsAt`, вернуть `basic`.
2. Если `trialActive = true`, вернуть выбранный trial-план по policy:
   - при выборе Pro в trial вернуть `pro`,
   - при выборе Premium в trial вернуть `premium`,
   - если выбор не сделан, trial-поведение по умолчанию остается premium-level.
3. Если есть активная paid подписка (`user_subscriptions.paymentStatus=active` и `endDate > now`), вернуть ее план.
4. Иначе вернуть `basic`.

#### BR-1. Вход в Trial

1. При регистрации: `trialEndedAt = now + 7d`.
2. По умолчанию trial дает доступы уровня Premium до `trialEndedAt`.

#### BR-2. Выбор Pro/Premium во время Trial

Если `trialActive = true` и выбран платный план:

1. Entitlements переключаются сразу на выбранный план.
   - Если в trial пользователь выбрал Pro, доступы сразу становятся Pro (без сохранения trial-Premium до конца периода).
2. Немедленный платеж не создается.
3. Сохраняются:
   - `billingPlan = selectedPlan`;
   - `billingPeriod = selectedPeriod`;
   - `nextChargeAt = trialEndsAt`;
   - `billingCollectionStatus = scheduled`.
4. Если `paymentMethodBound = false`, сначала обязателен шаг привязки метода.
5. Если привязка неуспешна/прервана, `billingPlan` не сохраняется и пользователь остается в текущем trial-состоянии.
6. При `checkoutAction=trial_scheduled` поле `trialEndedAt` не изменяется.

#### BR-3. Наступление TrialEndsAt

В момент `trialEndsAt` фоновый процесс пытается списать стоимость выбранного плана:

1. Условия запуска: `billingPlan != null`, `nextChargeAt <= now`, `paymentMethodBound = true`.
2. Успех платежа:
   - создается новый оплаченный период подписки (как `active` запись в `user_subscriptions`);
   - `billingCollectionStatus = none`;
   - `graceEndsAt = null`;
   - `nextChargeAt = endDate нового периода`.
   - `trialActive` должен стать `false` (допустима нормализация `trialEndedAt = now` или сохранение исторического значения `trialEndedAt <= now`).
3. Неуспех платежа:
   - `billingCollectionStatus = past_due`;
   - ставится `graceEndsAt = now + 48h`;
   - в период `now < graceEndsAt` доступы сохраняются платными;
   - при `now >= graceEndsAt`, если оплата не подтверждена, доступы откатываются в Basic.
4. Политика автоматических ретраев в `past_due`:
   - попытка 1: сразу при наступлении `trialEndsAt`;
   - попытка 2: через 6 часов;
   - попытка 3: через 24 часа;
   - ручной `Retry payment` не уменьшает лимит авто-попыток, но должен быть идемпотентным.

#### BR-4. Отмена будущего списания в Trial

До `trialEndsAt` пользователь может отменить запланированный платный план:

1. Очистить `billingPlan`, `billingPeriod`, `nextChargeAt`.
2. Установить `billingCollectionStatus = none`, `graceEndsAt = null`.
3. Не изменять существующие paid-подписки и не трогать исторические записи `user_subscriptions`.
4. Дальше пользователь продолжает Trial до конца и затем остается на Basic.

#### BR-5. Смена плана в Trial (Pro <-> Premium)

1. Entitlements меняются сразу.
2. `nextChargeAt` остается равным `trialEndsAt`.
3. В дату списания берется последний выбранный `billingPlan` и `billingPeriod`.

#### BR-6. Исключение `scheduled_downgrade` в Trial

1. Если `trialActive = true`, команда выбора плана никогда не должна возвращать `scheduled_downgrade`.
2. В Trial используется только модель `billingPlan/billingPeriod/nextChargeAt` (trial-scheduled billing).
3. `scheduled_downgrade` применяется только для paid-периодов.

---

### 5. Требования к API (с учетом текущих маршрутов)

#### API-1. `GET /api/subscriptions/current`

Расширить ответ полями:

1. `trialActive`
2. `trialEndsAt` (единый нейминг, без `trialExpiresAt`)
3. `currentEntitlementsPlan`
4. `billingPlan` (`null | pro | premium`)
5. `billingPeriod` (`null | month | year`)
6. `nextChargeAt` (`null | datetime`)
7. `paymentMethodBound` (`boolean`)
8. `billingCollectionStatus` (`none | scheduled | past_due`)
9. `graceEndsAt` (`null | datetime`)

#### API-2. `POST /api/subscriptions/start-checkout`

Сохранить текущий endpoint как единую команду, но добавить trial-ветку:

1. Если `trialActive=false`: текущее поведение остается (обычный checkout с оплатой).
2. Если `trialActive=true` и выбран платный план:
   - при отсутствии payment method вернуть `checkoutAction=bind_payment_method_required` и токен/URL для bind-flow;
   - после успешной привязки сохранить `billingPlan/billingPeriod/nextChargeAt`, не создавая немедленный платеж.

Рекомендуется расширить `checkoutAction` новыми значениями:

1. `bind_payment_method_required`
2. `trial_scheduled`

Контракт шага:

1. `bind_payment_method_required` возвращает данные только для привязки метода (не для немедленного списания).
2. После успешной привязки клиент повторно вызывает `start-checkout` и получает `trial_scheduled`.
3. Для `trial_scheduled` сервер обязан вернуть:
   - `checkoutAction: "trial_scheduled"`,
   - `trialEndsAt`,
   - `billingPlan`,
   - `billingPeriod`,
   - `nextChargeAt` (равен `trialEndsAt`),
   - `currentEntitlementsPlan` (уже после применения выбора),
   - `paymentMethodBound`.

#### API-3. Привязка карты (новая команда)

Добавить отдельную команду, например:

1. `POST /api/subscriptions/bind-payment-method`

Требования:

1. Создает flow привязки метода через YooKassa (без немедленного списания за подписку).
2. По webhook/reconcile фиксирует `paymentMethodBound=true` и сохраняет реальный provider-идентификатор метода оплаты (например, `payment_method_id`), пригодный для рекуррента.
3. Не создает `pending` подписку и не переводит trial в paid в рамках этой команды.
4. Для связывания webhook с пользователем обязателен детерминированный correlation:
   - через `metadata.userId` и внутренний `bindingSessionId`,
   - и/или через стабильный `idempotency key` bind-сессии.

#### API-4. Фоновая команда списания в `TrialEndsAt` (новая)

Добавить периодический worker/job:

1. Находит пользователей с `billingCollectionStatus=scheduled` и `nextChargeAt <= now`.
2. Создает рекуррентный платеж по сохраненному методу.
3. Идемпотентность обязательна (повторный запуск не должен делать двойной charge).
4. Логирует результат в `subscription_events`.
5. Ключ попытки:
   - `chargeAttemptKey = userId + nextChargeAt + billingPlan + billingPeriod`.
6. Таблица попыток:
   - `billing_charge_attempts(chargeAttemptKey, status, providerPaymentId, attemptCount, lastAttemptAt)`.
7. Конкурентный контроль:
   - запись на списание должна атомарно переводиться в `processing`/`locked` перед вызовом провайдера;
   - второй воркер не должен брать ту же запись, пока lock активен.

#### API-5. Ручной retry для `past_due`

Добавить команду ручного повтора списания (endpoint нейминг фиксируется на этапе реализации, например `POST /api/subscriptions/retry-charge`):

1. Ручной retry запускает попытку списания "сейчас" по тем же правилам, что и воркер.
2. Должен использовать тот же `chargeAttemptKey` или его детерминированное расширение, чтобы исключить двойной charge.
3. Если для текущего `chargeAttemptKey` уже есть `success`, вернуть `noop`.
4. Ручной retry не уменьшает лимит автоматических попыток.

#### API-6. Отмена запланированного списания (в Trial)

Переиспользовать `POST /api/subscriptions/scheduled-change/cancel` или ввести отдельный endpoint, но контракт должен очищать именно trial-scheduled billing-поля:

1. `billingPlan`, `billingPeriod`, `nextChargeAt`, `billingCollectionStatus`, `graceEndsAt`.
2. Не изменять активные paid-подписки.

#### API-7. Reminder за 24 часа до списания (обязательный)

Добавить фоновую отправку reminder за 24 часа до `trialEndsAt`:

1. Каналы:
   - Push: обязателен (основной канал).
   - Email: опционален, только если email подтвержден и есть согласие на рассылку.
2. Критерии отбора:
   - `trialActive = true`,
   - `billingPlan != null`,
   - `nextChargeAt = trialEndsAt`,
   - `billingCollectionStatus = scheduled`.
3. Антидублирование:
   - reminder отправляется один раз на цикл списания;
   - нужен явный marker в данных/событиях (`reminderSentAt` или отдельный `subscription_event`), чтобы повторные воркеры не отправляли дубль.

---

### 6. Требования к данным

Нужно хранить:

1. Выбранный в Trial `billingPlan` и `billingPeriod`.
2. `nextChargeAt`.
3. `billingCollectionStatus`.
4. `graceEndsAt`.
5. Признак и данные привязанного метода оплаты (`paymentMethodBound` + идентификатор метода для provider recurring API).
6. Таблицу попыток списания `billing_charge_attempts`:
   - `chargeAttemptKey` (unique),
   - `status`,
   - `providerPaymentId`,
   - `attemptCount`,
   - `lastAttemptAt`.
7. Технические поля блокировки/обработки для конкурентно-безопасной работы воркера (`processing`/`lockedAt`/`lockedBy` или эквивалентная стратегия).
8. Маркер отправки reminder за 24 часа (`reminderSentAt` или эквивалентный флаг/событие с защитой от дублей).

Примечание: структура таблиц (в `users` или в отдельной billing-таблице) фиксируется на этапе схемы БД; главное, чтобы поля были доступны для атомарной обработки и идемпотентных ретраев.

---

### 7. UI/UX требования

#### UI-1. Прозрачность условий в Trial

До подтверждения показать явно:

1. `Списание: {trialEndsAt}`
2. `Доступ: сразу`
3. `Отмена: в любой момент до {trialEndsAt}`
4. `Сегодня списаний не будет`.
5. `Мы напомним за 24 часа до списания`.
6. `Вы сможете отменить до {trialEndsAt}`.
7. Если пользователь в trial-Premium выбирает Pro, показать предупреждение:
   - `После выбора Pro часть функций Premium станет недоступна сразу`.

#### UI-2. Confirm modal в Trial

При выборе платного плана в Trial:

1. Заголовок: `Переход на {Pro|Premium}`.
2. Текст:
   - `Доступ откроется сразу`;
   - `Первое списание будет {trialEndsAt}`;
   - `До этой даты списаний не будет`.
3. Кнопки:
   - `Подключить и привязать карту`;
   - `Отмена`.
4. Дополнительное действие (если пользователь идет из trial-Premium в Pro):
   - `Остаться на Premium`.

#### UI-3. Состояние после привязки и выбора

Показать:

1. Бейдж `Списание {trialEndsAt}`.
2. CTA `Отменить будущее списание`.
3. Явное указание выбранного `billingPlan`, чтобы не было конфликта с базовой trial-плашкой.

#### UI-4. Ошибка списания в конце Trial

При `past_due`:

1. Баннер `Оплата не прошла. Повторить оплату`.
2. Явный дедлайн: `Оплатите до {graceEndsAt}, иначе доступ будет ограничен`.
3. Явная кнопка повтора оплаты.

---

### 8. Ошибки и крайние случаи

1. Пользователь закрыл окно привязки: plan не сохранять, показать поясняющий toast.
2. Trial истек, платеж не прошел: `past_due` + grace period.
3. Карта удалена/недействительна к моменту charge: обработка как `past_due`.
4. Многократные ретраи worker: только один успешный charge (идемпотентность).
5. Пользователь сменил Pro на Premium за минуту до конца Trial: списать последнюю выбранную конфигурацию.

---

### 9. Критерии приемки

1. В Trial выбор Pro/Premium не вызывает немедленного списания.
2. После выбора в Trial пользователь видит дату первого списания.
3. В `trialEndsAt` система делает попытку списания выбранного тарифа.
4. Успешный платеж переводит пользователя в обычный paid-период.
5. Неуспешный платеж переводит в `past_due`, выставляет `graceEndsAt = now + 48h`, и по окончании grace period переводит в Basic.
6. До `trialEndsAt` пользователь может отменить запланированное списание.
7. Авто-ретраи выполняются по графику `0h`, `+6h`, `+24h` без двойного списания.
8. При выборе Pro в Trial entitlements сразу становятся Pro.
9. Отмена будущего списания в Trial немедленно очищает `billingPlan/billingPeriod/nextChargeAt/billingCollectionStatus/graceEndsAt` и это видно в `GET /api/subscriptions/current`.
10. За 24 часа до `trialEndsAt` реально отправляется reminder (push обязательно, email опционально по условиям), без дублей.

---

### 10. Зафиксированные решения

1. Во время `past_due` до `graceEndsAt` платные entitlements сохраняются, после `graceEndsAt` откат в Basic.
2. Длительность grace period фиксирована: `48 часов`.
3. Политика авто-ретраев: `3 попытки` по графику `0h`, `+6h`, `+24h`.
4. Ручной retry не считается в лимит авто-ретраев, но должен быть идемпотентным.
5. Если в Trial выбрать Pro, entitlements сразу переключаются на Pro.
