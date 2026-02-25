# ТЗ: нативный аудиодвижок для Mentala (Capacitor)

## 0. Контекст и цель

Переходим с текущей веб-архитектуры (`WebAudio + HTMLAudio fallback`) на нативный аудиослой через Capacitor plugin, чтобы:

- ускорить старт длинных треков (streaming)
- стабилизировать фон/lock screen на iOS/Android
- сохранить бесшовный loop для loop-треков
- унифицировать поведение плеера через единый `Audio Service`

Критично: миграция не должна сломать текущие сценарии `useMeditationPlayer` (timer/queue/fade/guard).

## 1. Проверенные источники

- `@capgo/native-audio` (npm): https://www.npmjs.com/package/@capgo/native-audio
- Основной репозиторий из npm metadata: https://github.com/Cap-go/capacitor-native-audio
- Алиас-репозиторий (указан в части ссылок плагина): https://github.com/Cap-go/native-audio
- `@mediagrid/capacitor-native-audio`: https://www.npmjs.com/package/@mediagrid/capacitor-native-audio
- Capacitor plugins: https://capacitorjs.com/docs/plugins
- Apple AVAudioSession: https://developer.apple.com/documentation/avfaudio/avaudiosession
- Capawesome Audio Player (fallback-референс): https://capawesome.io/plugins/audio-player/

Примечание по ссылкам Capgo: на 24 февраля 2026 `Cap-go/capacitor-native-audio` и `Cap-go/native-audio` указывают на один и тот же `HEAD`, но источником истины считаем репозиторий из npm metadata.

## 2. Выбранный подход

### 2.1 Основной плагин

- Основной выбор: `@capgo/native-audio`
- Проект на Capacitor 7, поэтому фиксируем major `7.x`
- Рекомендуемая фиксация: `"@capgo/native-audio": "7.11.2"` (без `^`)
- Апгрейд на Capacitor 8 не входит в эту задачу

### 2.2 Резервные варианты

- Резерв №1: `@mediagrid/capacitor-native-audio`
- Резерв №2: `@capawesome-team/capacitor-audio-player` только по отдельному решению (проверка лицензии/доступности через Insiders/registry)

### 2.3 Архитектурный принцип

- Единый `Audio Service` слой (`adapter pattern`)
- UI и composables работают только с контрактом `Audio Service`, без прямых вызовов плагина
- До полного паритета текущую реализацию не удаляем, а держим за feature flag

## 3. Функциональные требования

### 3.1 Базовые функции

- `play` по `https` URL
- `pause`, `resume`, `stop`
- `seek`
- `setRate` (если поддерживается платформой)
- `setVolume`
- События состояния/прогресса/ошибок для UI

### 3.2 Loop

- Loop выполняется нативным движком
- Для коротких loop-треков не должно быть слышимого шва

### 3.3 Streaming и старт

- Для длинных треков старт без ожидания полной загрузки
- При плохой сети UI получает корректный `buffering` state

### 3.4 Фоновое воспроизведение

- Сворачивание приложения не останавливает воспроизведение
- Lock screen не останавливает воспроизведение
- iOS: Now Playing + lock screen controls
- Android: media notification + transport controls

### 3.4.1 Android: обязательная реализация foreground service

- Для Android 8+ обязателен foreground service
- Обязательные permissions:
  - `android.permission.FOREGROUND_SERVICE`
  - `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`
  - `android.permission.WAKE_LOCK`
- Обязательны `MediaSession` и media notification channel
- Проверка на Android 14+ обязательна (ограничения FGS)

Важное ограничение: для `@capgo/native-audio` foreground service не создаётся автоматически, его реализуем в `android/` самого приложения.

### 3.5 iOS silent mode и Audio Session

- Медитации должны играть при включённом hardware silent switch
- Базовая категория: `.playback`
- Политика микширования: `mixWithOthers = false` (Mentala как primary audio source)

### 3.5.1 UX-политика iOS (фиксируем явно)

- Если играет внешний источник (Spotify/Apple Music), при старте медитации внешний звук прерывается
- При interruption (`.began`) плеер переходит в `paused`, таймер останавливается
- При interruption end:
  - если `shouldResume=true` и до interruption было `playing`, делаем auto-resume
  - если пользователь вручную поставил паузу до interruption, auto-resume не выполняем
  - если `shouldResume=false`, остаёмся в `paused`

### 3.6 Метаданные

- Передавать `title`, `category`, `artwork`, `duration`
- Обновлять метаданные при смене трека

### 3.7 Web-совместимость и ограничения

- Web обязателен (проект кроссплатформенный)
- Для web считаем достаточным:
  - `play/pause/stop/seek/progress/error`
  - корректный `buffering` state
  - отсутствие зависаний и рассинхрона UI/фактического звука
- Для web не является обязательным:
  - background playback parity с native
  - lock screen controls parity
  - KPI “бесшовный loop без шва”

## 4. Контракт Audio Service

### 4.1 Файлы

- `app/services/audio/nativeAudio.service.ts`
- `app/services/audio/audio.types.ts`

### 4.2 Внешний интерфейс

- `init()`
- `load(track)`
- `play(track, options?)`
- `pause()`
- `resume()`
- `stop()`
- `seek(ms)`
- `setLoop(enabled)`
- `setVolume(value)`
- `setRate(rate)`
- `subscribe(handler)`
- `destroy()`

### 4.3 Нормализованный event contract

```ts
export type AudioServiceEvent =
  | { type: 'ready'; trackId: string }
  | { type: 'playing'; trackId: string; positionMs: number; durationMs: number }
  | { type: 'paused'; trackId: string; positionMs: number }
  | { type: 'stopped'; trackId: string }
  | { type: 'ended'; trackId: string }
  | { type: 'buffering'; trackId: string; isBuffering: boolean }
  | { type: 'error'; trackId: string; message: string; code?: string };
```

## 5. Маппинг `@capgo/native-audio` -> `Audio Service`

### 5.1 Маппинг методов

| Audio Service | `@capgo/native-audio` | Комментарий |
| --- | --- | --- |
| `init()` | `configure(...)` | На Android (ветка 7.x): `background`, `showNotification`, `focus`. На iOS: `ignoreSilent`, `showNotification`. |
| `load(track)` | `preload(...)` | `assetId` детерминированный (например `track:${track.id}`), `assetPath` из media URL, `isUrl: true`. |
| `play(track, options?)` | `play(...)` | Перед `play` гарантируем `preload`. |
| `pause()` | `pause(...)` | Стейт переводим в `paused`. |
| `resume()` | `resume(...)` | Возврат из `paused`. |
| `stop()` | `stop(...)` + при необходимости `unload(...)` | `stop` сбрасывает позицию. |
| `seek(ms)` | `setCurrentTime({ time: ms / 1000 })` | В плагине время в секундах. |
| `setVolume(value)` | `setVolume(...)` | value `0..1`. |
| `setRate(rate)` | `setRate(...)` | Ограничения диапазона валидируются в сервисе. |
| `setLoop(true)` | `loop({ assetId })` | Нативный loop для текущего asset. |
| `setLoop(false)` | Сервисный fallback | В плагине нет явного `unloop`; отключение через сервисную логику (остановка/перезапуск без loop-флага). |

Примечание по версиям: `backgroundPlayback` в документации помечен как `@since 8.2.0`; для фиксированной ветки `7.11.2` используем `background: true` и проверяем поведение на реальных Android-устройствах.

### 5.2 Маппинг событий

| Источник в `@capgo/native-audio` | Нормализованное событие | Как формируем |
| --- | --- | --- |
| Успешный `preload` | `ready` | Сразу после завершения `load`. |
| Успешный `play`/`resume` + `addListener('currentTime')` | `playing` | Отправляем стартовое событие и обновляем по `currentTime` (100ms). |
| Успешный `pause` | `paused` | Текущая позиция из last known `currentTime`. |
| Успешный `stop` | `stopped` | Позиция сбрасывается в 0. |
| `addListener('complete')` | `ended` | Срабатывает по завершению non-loop трека. |
| Исключения/Rejected Promise | `error` | Нормализуем `message`/`code`. |
| Явного buffering-события нет | `buffering` (синтетика) | Включаем при `load/play` и выключаем при первом `currentTime > 0` или timeout/error. |

## 6. Android foreground service: целевая архитектура

Фиксируем одну схему (чтобы реализация не “поплыла”):

1. Реализация foreground service в модуле приложения:
   - `android/app/src/main/java/com/mentala/app/audio/MentalaAudioForegroundService.java`
2. JS-мост в нативный сервис:
   - `android/app/src/main/java/com/mentala/app/audio/MentalaAudioForegroundPlugin.java`
   - JS-обёртка `app/services/audio/androidForegroundBridge.ts`
3. Ответственность:
   - `nativeAudio.service.ts` управляет плеером (`@capgo/native-audio`)
   - foreground service управляет жизненным циклом фонового выполнения
   - метаданные/статус синхронизируются из `nativeAudio.service.ts` в foreground service через bridge
4. Канал уведомлений:
   - отдельный media channel (не смешивать с push `mentai_high`)
5. `AndroidManifest.xml`:
   - сервис + intent-filter для media/session
   - FGS permissions из раздела 3.4.1

## 7. Паритет с текущим `useMeditationPlayer` (обязательные сценарии)

### 7.1 Timer сценарии

- `TIMER-01`: пользователь ставит 30 минут, запускает трек, срабатывает автоостановка
- `TIMER-02`: pause/resume не теряет корректный `timerRemainingMs`
- `TIMER-03`: `preferredTimerMinutes` сохраняется между переключениями треков

### 7.2 Queue сценарии

- `QUEUE-01`: `queueIds/queueKey` сохраняются при переходе next/prev
- `QUEUE-02`: быстрые переключения не оставляют “подвешенный” playing/paused state

### 7.3 Fade сценарии

- `FADE-01`: `fade-in` при play (`~300-500ms`)
- `FADE-02`: `fade-out` при pause/stop/switch (`быстрый` и `обычный` режимы)

### 7.4 Guard сценарии

- `GUARD-01`: `playbackAllowed=false` блокирует старт
- `GUARD-02`: при блокировке очищаются pending-переходы и очередь автозапуска
- `GUARD-03`: guard не оставляет `isBuffering=true` после отмены старта

## 8. План миграции по флагу

1. Добавить feature flag `audio.nativeMeditation.enabled`.
2. Реализовать `nativeAudio.service.ts` и `androidForegroundBridge`.
3. Подключить сервис в `useMeditationPlayer` под флагом, оставить текущий путь fallback.
4. Закрыть паритетные сценарии из раздела 7.
5. Закрыть платформенные кейсы (iOS/Android/Web).
6. Включить флаг на dev/stage.
7. После стабильности и отсутствия регрессий удалить legacy ветку HTML/WebAudio.

## 9. Тест-кейсы

### 9.1 iOS

- Silent switch ON: звук есть для loop/non-loop
- Первый старт без “тихого старта”
- Background/lock screen стабильны
- Interruption/route change корректно отрабатываются

### 9.2 Android

- 30+ минут background playback
- Корректный media notification/control flow
- Bluetooth route change без потери playback
- Loop без слышимого шва

### 9.3 Web

- Стабильные `play/pause/stop/seek`
- Корректные `progress/buffering/error`
- Отсутствие регрессий UI плеера

## 10. Definition of Done (измеримые критерии)

- Cold start (без кэша): первый звук `< 1500ms` на 4G, трек до 5 МБ
- Warm start (с кэшем): первый звук `< 800ms` на 4G, трек до 5 МБ
- Loop:
  - пользовательский критерий: не слышен шов
  - технический критерий (если доступны данные движка): межитерационный gap `<= 10ms`
- Восстановление после interruption `< 2s`
- Android background playback `>= 30 min` без убийства сервиса
- Нет регрессий по `timer/queue/fade/playbackAllowed`
- Нет unhandled native/audio errors в логах

## 11. Сопутствующие изменения в проекте

- Обновить `.docs/architecture.md` (статус миграции + целевая схема аудио)
- Зафиксировать версию плагина в `package.json` без `^`
- Обновить `AndroidManifest.xml` (permissions + service declaration)
- Добавить интеграционные/e2e кейсы: background, interruption, route change
