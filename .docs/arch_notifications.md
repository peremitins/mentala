# Уведомления

## Терминология в UI

- В пользовательском интерфейсе привычек и терапии используем термин `напоминания`, когда речь идёт о поддерживающих сообщениях и их расписании.
- Термин `уведомления` оставляем для системного уровня: push-разрешений ОС, delivery-механики, FCM/APNs и внутренних технических сущностей.

## Настройки (`notification_preferences`)

- `active_days`, `time_range_start/end`, `custom_slot_times` (до 5), `entity_key`
- `text_source_normalized`: templates | ai
- `custom_prompt_notification` — пожелания пользователя (только для шаблонных тем, только AI)
- `timesPerDay`: 1..5, дефолт для новых настроек — 2 раза в день, `customSlotTimes` в пределах этого лимита
- Welcome-онбординг может создать активные настройки по выбранным каталоговым темам терапии/привычек. `notification_preferences.enabled=true` означает, что тема настроена в продукте; фактическая доставка всё равно требует активного native/PWA/browser endpoint с системным разрешением.

## Генерация текстов

- **Templates**: готовые шаблоны из `notification_text_presets` → персональные копии в `notification_texts` (lazy init)
- **AI**: Buffer Pool — до 50 текстов за раз, хранятся в `ai_generated_notification_texts`, автопополнение при <2 дней запаса
- AI debounce-dedup через BullMQ `ai-text-generation`, лимит 3 задачи на пользователя
- Изоляция данных: каждый пользователь работает только со своими текстами
- `tone`/`addressing` влияют на генерацию; при изменении → регенерация AI-пулов

## Слоты (`notification_slots`)

- Состояния: planned → queued → sent/failed/skipped
- Запрещён переход queued → planned
- Генерация: sharded enqueue с cursor/cycle, backpressure по queue lag
- Регенерация: только при почти пустом горизонте (<2ч), `queued` не удаляются
- Inter-process lock: `pg_try_advisory_xact_lock`
- Жёсткий инвариант: слот с `scheduledAt <= now` не вставляется
- `kind=system` используется для продуктовых follow-up push:
  - `session_summary_ready` — push о готовом непрочитанном `session_summaries_user`;
  - `reengagement_inactive` — мягкий возврат после отсутствия пользователя.
    Такие слоты идут через тот же delivery pipeline, что и therapy/habits, но перед отправкой проходят system guard.

## Activity / follow-up

- `POST /api/activity/ping` фиксирует продуктовую активность аккаунта в `user_engagement_state`.
- `startup` обновляет `last_seen_at`, timezone и сбрасывает `reengagement_stage=0`.
- `foreground` и `heartbeat` обновляют `last_seen_at` только при `clientVisible=true` и `clientFocused=true`; это защищает re-engagement от web/PWA push-доставки, которая может разбудить скрытую страницу без фактического возврата пользователя.
- Любой `startup`/`foreground`/`heartbeat` в течение 2 минут после `notification_slots.status=sent` не считается возвратом, если нет явного `source=notification_click` или `notification_interactions.action=open`. Это закрывает iOS/PWA wake, где браузер может считать документ видимым даже при заблокированном телефоне.
- `background` обновляет только `last_backgrounded_at`.
- Клиент отправляет ping на startup, web `visibilitychange/focus/blur/pagehide`, native Capacitor `App.appStateChange` и active heartbeat раз в 15 минут. Foreground/heartbeat-события имеют debounce 60 секунд.
- System scheduler запускается каждые 15 минут:
  - summary-ready планируется на 12:00 local time; текст: `Итог сессии готов` / `Сводка готова: главные мысли и следующие шаги ждут внутри.`;
  - re-engagement стартует после 36 часов отсутствия, затем 72 часа и 7 дней, с daily/weekly cap и приоритетом summary-ready.
- При `POST /api/session-summaries-user/:id/viewed` активные `session_summary_ready` слоты для этого итога переводятся в `skipped`; delivery guard дополнительно проверяет `viewed_at` прямо перед отправкой.
- В локальном `NODE_ENV=development` re-engagement ускоряется для проверки: stage 1/2/3 наступают через 1/2/3 часа отсутствия, слот ставится на ближайшую минуту, recent caps сокращаются до 5 минут, upcoming window — до 10 минут, лимит окна — 3 re-engagement за 3 часа. Override: `SYSTEM_NOTIFICATIONS_FAST_REENGAGEMENT=true|false`.
- Для timezone используется последний IANA timezone из `X-Timezone`; fallback — `Europe/Moscow`.

## Delivery

- Scheduler: симметричное окно `now ± lookahead`, delayed jobs в BullMQ
- Stale: протухшие planned старше `NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP` → skipped
- Для custom-источников: entitlement-check, без доступа → skipped
- Для system-слотов delivery worker повторно проверяет актуальность перед отправкой:
  непрочитанный summary всё ещё существует, пользователь не вернулся до re-engagement, не нарушены приоритеты и лимиты.

## Push (FCM)

- **Android**: data-only сообщения, `MentalaMessagingService` строит системное уведомление. Один обработчик `MESSAGING_EVENT`
- **Android**: не используем `full-screen intent` и permission `USE_FULL_SCREEN_INTENT`; push показываются как обычные high-priority системные уведомления через `contentIntent`
- **iOS**: FCM token через `@capacitor-community/fcm`, APNs только для диагностики. Rich-image через `MentalaNotificationService` (UNNotificationServiceExtension)
- Foreground-показ на iOS идёт штатно через `PushNotifications.presentationOptions` и системный `UNUserNotificationCenterDelegate` из Capacitor
- Debug и Release на iOS должны быть разведены по APNs-среде: debug/local использует `aps-environment=development`, release/TestFlight — `aps-environment=production`
- Разделение окружений: `user_devices.app_env` = серверное окружение
- Server `firebase-admin` и мобильные `google-services.json` / `GoogleService-Info.plist` должны смотреть в один и тот же Firebase project; иначе получаем `SenderId mismatch` и автоматическую чистку токена
- `messaging/authentication-error` / `third-party-auth-error` на iOS обычно означает проблему с APNs credentials в Firebase project (APNs key не загружен, инвалиден или не соответствует Team ID / Bundle ID)
- `/api/notifications/register-token` обязан быть идемпотентным по `user_devices.token`, потому что один и тот же токен может параллельно зарегистрироваться из push-плагина, auth-store и экрана настроек
- Native-клиенты обязаны передавать `installationId` из `@capacitor/device` (`Device.getId().identifier`); web/PWA передают локальный `installationId` из browser storage. Это основной device-key для дедупликации каналов одного устройства.
- Канал web push различаем на `pwa` и `browser`: standalone/Home Screen регистрация выше по приоритету, чем обычная вкладка браузера
- Web Push перед регистрацией токена проверяет не только браузерные API, но и `firebase/messaging.isSupported()`. Если API разрешения есть, но Firebase Messaging или `getToken()` не сработали, UI показывает отдельное состояние ошибки регистрации, а не общий fallback неподдерживаемого браузера.
- Web Push Firebase config (`VITE_FIREBASE_*` и `VITE_FIREBASE_VAPID_PUBLIC_KEY`) должен попадать в Docker build как build args. Эти значения используются через `import.meta.env` в клиентском bundle и `sw.js`, поэтому runtime `.env` на сервере не исправит уже собранный PWA.
- В iOS/iPadOS PWA нет web API для прямого открытия системного экрана настроек уведомлений, поэтому recovery UX даёт ручной путь `Настройки -> Уведомления -> Ментала -> Допуск уведомлений` и просит полностью перезапустить PWA после изменения системного разрешения.
- Delivery-маршрутизация выполняется по устройствам: разные `installationId` одного пользователя получают push независимо, а внутри одного device-key выбирается один endpoint по приоритету `native > pwa > browser > legacy`.
- Mobile PWA/browser не создаёт отдельную доставку, если у пользователя уже есть active native endpoint той же `platformFamily`; такой endpoint используется только как fallback для native этой mobile-платформы. Это закрывает дубль `Android native + Android PWA/browser`, где платформы не дают общий физический device-id.
- Runtime delivery использует failover-цепочку внутри каждого device-key: если лучший endpoint конкретного устройства реально не доставился (протухший/невалидный токен), сервер пробует следующий канал этого же устройства и затем продолжает доставку на остальные устройства.
- Native toggle в настройках приложения отключает только текущий native endpoint: клиент снимает регистрацию токена устройства и ставит локальный флаг запрета на автоперерегистрацию, но не меняет глобальный `users.pushNotificationsEnabled`, чтобы сохранялся fallback на `pwa` и `browser`
- Невалидные токены (invalid-registration-token и др.) автоудаляются из `user_devices`
- На iOS нельзя полагаться только на первый `registration` event: после reinstall/первого старта FCM token может дообновиться позже APNs-регистрации, поэтому клиент повторно синхронизирует актуальный FCM token при старте приложения, логине и возврате в active
- Для локальной iOS-диагностики ориентируемся на короткие префиксы APNs/FCM token в логах `AppDelegate` и `push-notifications.client.ts`; это позволяет сопоставить текущий девайс с серверным `Sending to device: ios (...)`
- Xcode app console не гарантирует видимость логов `UNNotificationServiceExtension` и системной доставки, поэтому для проверки rich push и фоновой доставки полезнее смотреть device logs через macOS Console.app / Xcode Devices

## Изображения

- Runtime-подбор: `rules + score` с порогом `MATCH_SCORE_THRESHOLD=0.65`
- Приоритет: `{kind}/{entity}/{tag}` → `common/{tag}`
- Для templates: изображение только при платной подписке
- Валидация: только https + jpg/png, <1MB

## Навигация по push

- Payload: `deepLink`, `navigation`, `data.action` + параметры
- Приоритет: deepLink → data.action → navigation → `/`
- Client: очередь с TTL, дедупликация по messageId, retry до router.isReady()
- `actionHint` определяет цель (breathing → slug техники, meditation → trackId)
- Для темы `Дневник благодарности` target/deepLink форсируется по `title`/`entityKey=gratitude`, даже если `actionHint` отсутствует или в старом payload записан `home`

## Unified Navigation v1

- `AppNavigationTarget` в `shared/navigation/index.ts` — канонический контракт
- Server: `chat-navigation.service.ts` строит action chips детерминированно
- Client: `useAppNavigation` + entitlement-gate + `FeaturePaywallModal`
