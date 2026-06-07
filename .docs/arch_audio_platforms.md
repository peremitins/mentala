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
- Для дыхательных практик iOS voice-клипы идут через `AVPlayer` с `automaticallyWaitsToMinimizeStalling = false` и `playImmediately(atRate:)`, иначе короткие HTTP-клипы постепенно отъезжают от cue/фазы из-за автоматического ожидания буфера
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
- При запуске realtime voice фон `scene-selection` захватывается через общий `sceneAudioFocus` lock: сцена уходит в `useSceneAudio().suspend({ withFade: false })`, а после `stop/page_leave/error` возвращается через `resume()` только когда больше не осталось других активных mic-lock'ов
- Основной `turn_detection` — `semantic_vad` с `eagerness=low`, чтобы уменьшить ложные срабатывания на короткий шум и шорохи
- Rollback через env остаётся на `server_vad` с консервативными параметрами `threshold=0.7` и `silence_duration_ms=1000`
- В `audio.input` всегда включено `noise_reduction: near_field`
- На mobile (`iOS/Android`) client-side `response.cancel` по `speech_started` отключён; barge-in сохраняется только на `web`
- На iOS используется provider-side auto-response, но вместо `semantic_vad` включается консервативный `server_vad` (`threshold=0.7`, `silence_duration_ms=1000`), чтобы первый ответ не стартовал на слишком раннем semantic-turn.
- На mobile (`iOS + Android`) WebRTC mic-track отключается на время ответа ассистента (half-duplex `setMicrophoneEnabled(false)` от `response.created` до `output_audio_buffer.stopped`/`response.done`). Это главная защита от самозаписи/дублирования («привет привет»): пока ассистент говорит, вход физически выключен и модель не может услышать саму себя. Входные user-события (`input_audio_buffer.*`, `conversation.item.input_audio_transcription.*`, user `conversation.item.created`), появившиеся во время mute/playback и не относящиеся к уже начатому user item, считаются echo от динамика и не попадают в UI; transcript уже начатого user item всегда пропускается и сохраняется.
- На iOS перед стартом WebRTC realtime voice локальный `MentalaRealtimeVoiceAudio`
  переводит `AVAudioSession` в `.playAndRecord` + `.voiceChat` и закрепляет вывод на speaker; фоновая сцена при этом глушится без fade, чтобы playback-сессия/хвост сцены не попадали обратно во входной микрофон.
- На Android realtime voice идёт как ОБЫЧНОЕ МЕДИА: плагин держит `MODE_NORMAL` и `setVolumeControlStream(STREAM_MUSIC)`, маршрут/громкость отдаёт ОС. `MODE_IN_COMMUNICATION` НЕ используется намеренно — он (документированное поведение Android) насильно уводит аппаратные клавиши громкости на `STREAM_VOICE_CALL`, тогда как WebRTC-аудио WebView звучит на `STREAM_MUSIC`, из-за чего громкость ассистента становилась нерегулируемой и тише. Эхо/самозапись лечатся software AEC (`echoCancellation` в getUserMedia) + half-duplex мьютом микрофона (см. выше). Прошлая попытка media-режима ломалась именно отсутствием мьюта на Android.
- На `output_audio_buffer.started` Android защитно пере-утверждает media-режим (`MentalaRealtimeVoiceAudio.activate()`): Chromium/WebView может заново перехватывать audio route. Новый native `activate()` идемпотентен и НЕ переключает маршрут (только `setMode(NORMAL)`/`setVolumeControlStream(STREAM_MUSIC)`), поэтому не режет первые слова. На iOS пере-активация на старте output-аудио запрещена — смена `AVAudioSession` там съедает первые слова и провоцирует route-change гонки.
- BT-наушники в media-режиме используются как A2DP (стерео-вывод высокого качества); вход идёт со встроенного микрофона телефона — headset-микрофон через SCO не задействуется (компромисс ради корректной громкости и качества звука).
- Громкость аппаратными клавишами: работает на iOS (любой браузер — движок WebKit, через `navigator.audioSession`), desktop и в нативном Android-аппе (фикс media-режима выше). **На Android в браузере/PWA клавиши НЕ управляют WebRTC-аудио** — известное ограничение Chrome: аудио идёт на media-канал, а клавиши при активном микрофоне на call-канал (`navigator.audioSession` в Chrome не реализован, см. caniuse; ровно тот же баг — jitsi-meet#16020, closed as not planned). Из веба перемаршрутизировать клавиши нельзя — нет доступа к `AudioManager`.
- Для Android web/PWA регулировка даётся программно: `realtimeVoiceUi.outputVolume` (0..1, персист в localStorage) → `RealtimeVoiceTransport.setOutputVolume()` → `remoteAudioElement.volume`. UI — `AssistantVolumeControl.vue` (иконка громкости в `PageHeader` слот `#actions` + анимированный слайдер-поповер), показывается ТОЛЬКО на Android web/PWA при активной realtime-сессии; на iOS/desktop/native не рендерится (там клавиши работают).
- Для iOS real device локальный `pnpm cap:sync:device` не должен оставлять `server.url`
  на HTTP LAN-origin: WKWebView может скрыть `navigator.mediaDevices`, поэтому этот режим собирает development static bundle из `.env.development` и подставляет локальный dev backend в `NUXT_PUBLIC_API_SERVER_URL`; LAN live reload остаётся только в `cap:sync:device:wireless` и не гарантирует Realtime Voice.
- На native iOS любой отказ в доступе к микрофону, включая первый отказ в системном prompt и повторный отказ из WKWebView/getUserMedia, обязан открывать общий `MicPermissionDeniedDialog`; Android сохраняет прежний flow без принудительного показа модалки после первого системного отказа
- Если пользователь отклонил доступ к микрофону в `web` или `PWA`, следующий запуск voice/dictation обязан открывать общий `MicPermissionDeniedDialog` с инструкцией по ручному восстановлению разрешения; на native по-прежнему используется переход в системные настройки приложения
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
- Любая голосовая диктовка через `speechStore.isListening` и realtime voice используют общий `sceneAudioFocus` reference-counted lock, чтобы несколько mic-сценариев не ломали друг другу возврат фоновой сцены. Layout также смотрит на reactive-состояние этого lock'а, поэтому при foreground-resume фоновая сцена не поднимается поверх активного realtime/mic.
- После остановки/паузы медитации layout watcher вызывает `sceneAudio.resume()` и возвращает сцену, если до suspend она играла, пользователь всё ещё в active state и громкость сцены больше 0
- Resume сцены после медитации отложен и отменяем через `playbackActionId`/`resumeAfterSuspendActionId`: быстрый `pause → play` в медитации не должен поднимать scene-source параллельно с meditation-source
- На iOS native meditation `pause` не оставляет MediaGrid/AVPlayer source в paused-состоянии: позиция сохраняется в JS, source останавливается/уничтожается, следующий `play` создаёт новый `audioId` и стартует с сохранённой позиции. Android остаётся на штатном `pause()`/`resume()`
- При смене сцены `play()` фиксирует новый `currentScene` до остановки старого source, а `kickstart()` игнорирует buffering только для той же сцены. Это защищает от гонки layout watcher + tap handler, из-за которой новая сцена требовала повторный тап

## Breath Practice Audio

- Web/legacy: основная дыхательная сессия рендерит один короткий cycle WAV через `OfflineAudioContext` и проигрывает его как looped `HTMLAudioElement`, по аналогии с медитацией. Это нужно для Chrome mobile background/lock screen: phase `setInterval` / `setTimeout` в hidden tab замораживаются, а continuous media playback продолжает звучать. Старые Howler phase clips остаются fallback, если cycle media не удалось собрать или запустить
- Native iOS/Android: основная практика идёт через отдельный `NativeBreathSessionService`, который управляет MediaGrid breathing-session поверх плагина, а intro-voice остаётся отдельным коротким source
- Для native breathing нельзя строить source из локального bundle-origin (`http://localhost` / WebView origin) в production release: MediaGrid/Media3/AVPlayer должны получать публичный `appUrl`/`apiBase` origin (`https://my.mentala.app/.../breath/*`), потому что `mediaBaseUrl` для `breath/*` не используется и локальный WebView origin доступен не всем native playback route
- Для native breathing в development наоборот используем текущий WebView origin как source base, включая `http://localhost:3000` через `adb reverse`: это нужно, чтобы Android device не ходил в `local.mentala.app`/другой desktop-only host и не падал с `UnknownHostException`
- Исключение для iOS dev: если WebView поднят с HTTP LAN-origin, native `AVPlayer`
  для breath voice/cue берёт HTTPS `appUrl`/`apiBase` вместо `http://<LAN_IP>`, иначе короткие voice/cue клипы могут молча не стартовать.
- В native breathing-session primary source всегда один: cue-loop с `useForNotification: true`, либо voice-клип, если `sounds/*` выключены. Дополнительный voice при `sounds + voice` идёт параллельно на secondary source с `useForNotification: false`, иначе Android падает с `There can only be one`
- Плагин пропатчен дополнительными командами `startBreathingSession`, `pauseBreathingSession`, `resumeBreathingSession`, `stopBreathingSession`, `updateBreathingSessionConfig`; они сами переключают фазы по native timers и не зависят от JS `setInterval`
- Включённые одновременно `voice + sounds` в native breathing стартуют почти одновременно, но не строго одним вызовом: `cue` запускается первым, а `voice` получает только микрокомпенсацию старта (`~45ms`) на входе новой фазы, чтобы нивелировать prepare/buffer lag у `sounds/*`; по `pause/resume` current phase не пересоздаётся через JS, а продолжается внутри native session
- Если `sounds/*` выключены, остаётся только voice-клип как primary; если voice выключен, текущий voice source просто гасится, а cue остаётся primary. Обратное включение канала вступает только со следующей фазы, без дубля текущей voice-фразы
- Cue-треки дыхательных практик (`public/breath/sounds/*`) на native уходят в короткий phase-end fadeout перед переключением шага; voice-клипы не фейдятся. Web-ветка дыхательных cue сейчас играет без phase-end fadeout
  На native fade держим мягче (`~280ms`, `8` steps), чтобы переход между фазами не звучал как жёсткий обрыв
- Cue-файлы `public/breath/sounds/*` для Android держим в AAC LC с частотой не выше `48 kHz`: Android platform docs гарантируют стандартные sampling rates `8–48 kHz` для AAC, а `96 kHz` cue могут молча ломать playback в release WebView / Media3 route
- Таймер дыхательной практики хранит абсолютный `endsAt` в UI для синхронизации прогресса и одновременно уходит в native breathing-session; фактическая остановка практики в фоне / под локскрином не зависит от живого WebView
- Для Android pool нужно поднимать выше дефолтного (`html5PoolSize > 10`), потому что web-route дыхания держит несколько отдельных HTML5 Audio nodes для voice/cue
- Любой toggle voice/cue и `unmount` в web-route обязан делать `Howl.unload()`, а не только `stop()`, иначе ноды не возвращаются в pool и следующие фазы начинают теряться
