# Аудио-платформы

## Native Audio (`@mediagrid/capacitor-native-audio`)

- Адаптер: `app/services/audio/nativeAudio.service.ts`
- Native-плагин: MediaGrid `AudioPlayer` (`@mediagrid/capacitor-native-audio@2.3.2`) для Capacitor 7
- Единая стратегия для native iOS/Android: meditation-треки и `scene-selection` идут через `AudioPlayer.create()` → `initialize()` → `play()` с CDN URL из `mediaBaseUrl`
- Для медитаций правило background жёсткое: если sleep timer выключен (`Без таймера` / `0 минут`), `appStateChange(isActive=false)` должен мгновенно останавливать playback; если выбран `N > 0`, background playback разрешён до окончания таймера
- Старый native-аудиоплагин, iOS loop cache через `Filesystem`, `nativeAudio.platform.ts`, `androidForegroundBridge.ts` и `MentalaAudioForegroundService` удалены
- В native runtime не используется неявный fallback на WebAudio/HTMLAudio: ошибка MediaGrid должна быть видна как ошибка native playback, а не маскироваться старым route
- Для `useForNotification: true` Android регистрирует сервис `us.mediagrid.capacitorjs.plugins.nativeaudio.AudioPlayerService`; iOS использует включённый `UIBackgroundModes=audio`
- MediaGrid допускает один `useForNotification: true` source. В обычном фоне его может занимать `scene-selection`, но при старте медитации `sceneAudio.suspend()` обязан уничтожить source сцены до создания медитационного source; приоритет всегда у медитации
- `audioId` обязательно namespaced по домену (`meditation_*`, `scene_*`): сцены переиспользуют те же ids/файлы, что и медитации, а MediaGrid управляет source глобально по `audioId`. Без namespace cleanup сцены может остановить paused source медитации
- Быстрые `pause → play/resume` в native adapter защищены `playbackCommandId`: устаревшая pause-команда после fade не должна вызывать native `pause()` и перебивать новый `play()`
- Системные controls для медитации минимальные: в `AudioPlayer.create()` всегда передаются `showSeekBackward: false` и `showSeekForward: false`

## iOS

- Loop-треки создаются с `loop: true`; внутри MediaGrid iOS использует `AVQueuePlayer` + `AVPlayerLooper`
- Non-loop треки создаются с `loop: false`; пользовательский repeat реализуется через `onAudioEnd` → `seek(0)` → `play()`, чтобы не отдавать обычные длинные медитации в iOS `AVPlayerLooper`
- Для iOS loop патч MediaGrid читает `getDuration()`/`getCurrentTime()` из активного `AVQueuePlayer`/`AVPlayerItem`; UI всё равно держит DTO-duration и локальный clock для loop-треков, чтобы не зависеть от нестабильного native progress
- Native adapter не опрашивает `getDuration()`/`getCurrentTime()` для loop-треков; позиция считается JS-clock от DTO-duration, а stale progress tick после переключения обязан игнорироваться
- `seek()` и `setRate()` для iOS loop в самом плагине no-op; в текущем UI у loop-медитаций нет scrubber-прогресса
- MediaGrid `2.3.2` закреплён через `pnpm patch`: в iOS loop-mode active player живёт в `playerQueue`, поэтому обращения плагина к `player.rate` внутри Now Playing/remote controls заменены на безопасное чтение rate из активного player; Now Playing не пишет отрицательные duration/currentTime и держит отдельный `nowPlayingPlaybackRate`, чтобы loop-треки не выглядели как неактивный playback во время буферизации
- iOS Remote Command Center патчится под активные play/pause/toggle handlers и отключённые seek/next/previous/change-position команды. Это нужно, чтобы lockscreen controls не были неактивными и не показывали лишние действия

## Android

- Loop-треки создаются с `loop: true`; MediaGrid Android использует Media3 ExoPlayer `REPEAT_MODE_ONE`
- Background playback и media controls идут через `AudioPlayerService` (`MediaSessionService`) вместо нашего кастомного foreground service
- Manifest обязан держать `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` и `WAKE_LOCK`
- При смене трека активный MediaGrid source останавливается и уничтожается перед созданием нового source, потому что `loop` фиксируется при `create()`
- Android sleep timer дублируется в native-слой через патч MediaGrid `scheduleStop(audioId, delayMs)` / `clearScheduledStop(audioId)`. JS `setInterval` остаётся UI-счётчиком, но фактическая остановка не зависит от заморозки WebView при блокировке экрана
- Android Media3 session ограничивает `availablePlayerCommands` до play/pause + metadata-команд только для внешних/system controllers, чтобы системная notification не показывала лишнюю кнопку previous/seek-back. Внутренний controller приложения получает `addAllCommands()`, иначе MediaGrid не может выполнить `setMediaItem()`/`prepare()` и playback не стартует
- Слышимый шов на Android loop после миграции надо отдельно проверить на устройстве: теперь за loop отвечает ExoPlayer, а не прежний native-аудиоплагин

## Realtime Voice

- OpenAI Realtime API через WebRTC
- Основной `turn_detection` — `semantic_vad` с `eagerness=low`, чтобы уменьшить ложные срабатывания на короткий шум и шорохи
- Rollback через env остаётся на `server_vad` с консервативными параметрами `threshold=0.7` и `silence_duration_ms=1000`
- В `audio.input` всегда включено `noise_reduction: near_field`
- На mobile (`iOS/Android`) client-side `response.cancel` по `speech_started` отключён; barge-in сохраняется только на `web`
- Runtime compaction по бюджетам текстового чата
- Compaction строится text-моделью (gpt-realtime-\* не поддерживает json_schema)
- Provider-side truncation как safety net
- Generic error-события: recoverable по умолчанию, session не завершается
- iOS safe-area для инлайн-контролов

## WebAudio (браузер)

- Loop-треки web/legacy: AudioBufferSourceNode (бесшовный цикл)
- Длительность трека не используется для выбора WebAudio/HTMLAudio; мобильный guard проверяет фактический размер файла при загрузке буфера
- iOS: `navigator.audioSession.type = 'playback'`, восстановление через visibilitychange
- Gesture unlock: `AudioContext.resume()` после первого пользовательского жеста
- Кроссфейд при смене фаз (~200ms), fade при паузе (~120ms)

## Scene Selection Audio

- `scene-selection` на native iOS/Android использует тот же `NativeAudioService`/MediaGrid route, что и медитации; web/legacy остаётся на WebAudio для loop-сцен и HTMLAudio fallback для non-loop
- При старте медитации `useMeditationPlayer` вызывает `useSceneAudio().suspend()`: native-сцена жёстко останавливается и уничтожается, web/iOS legacy ставится на паузу
- После остановки/паузы медитации layout watcher вызывает `sceneAudio.resume()` и возвращает сцену, если до suspend она играла, пользователь всё ещё в active state и громкость сцены больше 0
- Resume сцены после медитации отложен и отменяем через `playbackActionId`/`resumeAfterSuspendActionId`: быстрый `pause → play` в медитации не должен поднимать scene-source параллельно с meditation-source
- На iOS native meditation `pause` не оставляет MediaGrid/AVPlayer source в paused-состоянии: позиция сохраняется в JS, source останавливается/уничтожается, следующий `play` создаёт новый `audioId` и стартует с сохранённой позиции. Android остаётся на штатном `pause()`/`resume()`
- При смене сцены `play()` фиксирует новый `currentScene` до остановки старого source, а `kickstart()` игнорирует buffering только для той же сцены. Это защищает от гонки layout watcher + tap handler, из-за которой новая сцена требовала повторный тап

## Breath Practice Howler

- Дыхательные voice/cue используют `Howler` с `html5: true`, а не Web Audio API: это стабильнее для коротких клипов в Android Capacitor WebView
- Для Android pool нужно поднимать выше дефолтного (`html5PoolSize > 10`), потому что одна практика держит несколько отдельных HTML5 Audio nodes для voice/cue
- Любой toggle voice/cue и `unmount` обязан делать `Howl.unload()`, а не только `stop()`, иначе ноды не возвращаются в pool и следующие фазы начинают теряться
