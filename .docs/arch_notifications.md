# Уведомления

## Настройки (`notification_preferences`)
- `active_days`, `time_range_start/end`, `custom_slot_times` (до 5), `entity_key`
- `text_source_normalized`: templates | ai
- `custom_prompt_notification` — пожелания пользователя (только для шаблонных тем, только AI)
- `timesPerDay`: 1..5, `customSlotTimes` в пределах этого лимита

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

## Delivery
- Scheduler: симметричное окно `now ± lookahead`, delayed jobs в BullMQ
- Stale: протухшие planned старше `NOTIFICATION_MAX_SLOT_AGE_HOURS_BEFORE_SKIP` → skipped
- Для custom-источников: entitlement-check, без доступа → skipped

## Push (FCM)
- **Android**: data-only сообщения, `MentalaMessagingService` строит системное уведомление. Один обработчик `MESSAGING_EVENT`
- **iOS**: FCM token через `@capacitor-community/fcm`, APNs только для диагностики. Rich-image через `MentalaNotificationService` (UNNotificationServiceExtension)
- Разделение окружений: `user_devices.app_env` = серверное окружение
- Невалидные токены (invalid-registration-token и др.) автоудаляются из `user_devices`

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

## Unified Navigation v1
- `AppNavigationTarget` в `shared/navigation/index.ts` — канонический контракт
- Server: `chat-navigation.service.ts` строит action chips детерминированно
- Client: `useAppNavigation` + entitlement-gate + `FeaturePaywallModal`
