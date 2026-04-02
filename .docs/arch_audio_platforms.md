# Аудио-платформы

## Native Audio (`@capgo/native-audio`)
- Адаптер: `app/services/audio/nativeAudio.service.ts`
- Платформенное разделение: `app/services/audio/nativeAudio.platform.ts`
- Android foreground service: `MentalaAudioForegroundService` (FOREGROUND_SERVICE + WAKE_LOCK)

## iOS
- Loop стратегия: `play → short prime → loop` (для MPNowPlaying/Control Center)
- Seek: `seekWithPlayFallback` только для remote-источников
- Loop-кэш: нативная загрузка `Filesystem.downloadFile` в Directory.Cache (без CORS), fallback на fetch
- Pending seek settle window: UI получает целевую позицию сразу, запаздывающие значения игнорируются

## Android
- Loop стратегия: прямой `loop()` без промежуточного `play()`
- Background: `allowBackgroundPlayback`, без `MODE_IN_COMMUNICATION`
- Stop: `stop()` + `unload` + полный сброс (исключает самопроизвольный рестарт)
- Seek: позиция подтверждается событиями плагина, fallback-поллинг отключён

## Realtime Voice
- OpenAI Realtime API через WebRTC
- Runtime compaction по бюджетам текстового чата
- Compaction строится text-моделью (gpt-realtime-* не поддерживает json_schema)
- Provider-side truncation как safety net
- Generic error-события: recoverable по умолчанию, session не завершается
- iOS safe-area для инлайн-контролов

## WebAudio (браузер)
- Loop-треки: AudioBufferSourceNode (бесшовный цикл)
- iOS: `navigator.audioSession.type = 'playback'`, восстановление через visibilitychange
- Gesture unlock: `AudioContext.resume()` после первого пользовательского жеста
- Кроссфейд при смене фаз (~200ms), fade при паузе (~120ms)

## Breath Practice Howler
- Дыхательные voice/cue используют `Howler` с `html5: true`, а не Web Audio API: это стабильнее для коротких клипов в Android Capacitor WebView
- Для Android pool нужно поднимать выше дефолтного (`html5PoolSize > 10`), потому что одна практика держит несколько отдельных HTML5 Audio nodes для voice/cue
- Любой toggle voice/cue и `unmount` обязан делать `Howl.unload()`, а не только `stop()`, иначе ноды не возвращаются в pool и следующие фазы начинают теряться
