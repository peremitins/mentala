# UI и фичи

## Практики (хаб `/practices`)

- Медитации, дыхательные практики, быстрая помощь, дневник благодарности
- Дыхательные: каталог в `app/lib/breathPracticesCatalog.ts`, плеер `BreathPracticePlayer.vue` + `BreathOrb.vue`
- Голосовые подсказки фаз из `public/breath/voice/{informal|formal}/*.mp3`
- Web/legacy дыхательные voice/cue идут через `Howler` с `html5: true`; native iOS/Android используют отдельный `NativeBreathSessionService` поверх MediaGrid для основной практики и отдельный intro-source для prep countdown
- На native дыхательная практика может держать два MediaGrid source одновременно: primary source для cue-loop c `useForNotification: true` и secondary source для voice c `useForNotification: false`; это нужно, чтобы voice и `sounds/*` стартовали одновременно и не конфликтовали на Android
- Таймер дыхательной практики считает остаток по абсолютному `Date.now()`, а не только по живому `setInterval`: после возврата из background фаза и `remaining` обязаны синхронизироваться без рассинхрона
- На native phase switching идёт в самом MediaGrid breathing-session, а stop по таймеру не зависит от JS timers: практика обязана завершиться даже при lockscreen/background
- Voice/cue для web-route дыхательных практик обязаны делать `unload()` при выключении канала и `unmount`, иначе в Android WebView быстро истощается глобальный `Howler.html5PoolSize` и отдельные фазы начинают пропадать
- Cue-треки `sounds/*` сейчас получают короткий fadeout только на native; voice-подсказки переключаются без fade, чтобы не смазывать команду фазы. В web-ветке fadeout временно отключён
- Переключение voice/cue во время уже идущей практики не должно повторно озвучивать текущую фазу: toggle меняет состояние канала без немедленного дубля того же шага
- `pause -> play` и `stop -> play` на native не перезапускают текущую фазу через JS: player вызывает `pauseSession` / `resumeSession`, а защита от stale команд делается на уровне session-service
- Кастомные практики: 1-30 сек фазы, 2-4 фазы, хранение в localStorage/Capacitor Preferences

## Быстрая помощь (`/quick-help`)

- 5 карточек: 5-4-3-2-1, Дыхание, Сброс напряжения, Выговориться, Выгрузка мыслей
- Входы: PageHeader, хаб практик, chat suggested chips (`open_sos`)
- `SOS / Снять напряжение в теле` использует cue `inhale/exhale` через `useBreathPracticeAudio`; mobile production route нужно прогревать заранее, иначе первый `clench` может пройти с voice, но без cue
- Для новых локальных настроек `SOS / Снять напряжение в теле` voice по умолчанию включён; уже сохранённый пользовательский toggle не перетирается
- Выгрузка мыслей: `/quick-help/thought-dump`, textarea + голосовой ввод, handoff в чат через `entryContext`
- iOS voice dictation через `@capacitor-community/speech-recognition` обязана переживать `No speech detected` без native-crash: plugin teardown должен быть nil-safe, `AVAudioEngine` очищается на main thread, а JS-движок не запускает двойной auto-restart после одного `stopped/end`

## Чат (`/`)

- На главной CTA `История сессий` показывает только пульсирующую точку-индикатор, если есть непросмотренный пользовательский итог; текстовый бейдж `Новое` остаётся внутри списка `/session-summaries-user`
- В списке и detail-экране пользовательских итогов подпись `N сообщений` означает весь диалог целиком: сообщения пользователя и ответы ассистента, а не только user turns
- Пользовательский итог сессии может появиться не только после ручного `Завершить сессию`, но и после logout или nightly-обработки server-side idle-сессии
- При cold start страницы `/chat` клиент сначала пытается восстановить весь несуммаризованный transcript backlog с сервера; если история найдена, она гидрируется в `chat.messages`, и только при полном отсутствии backlog запускается приветственный auto-start
- Если восстановленный backlog уже относится к ended/stale billing-сессии, он всё равно показывается в UI, но первое новое сообщение стартует новую `therapySession`, не обнуляя старую историю
- Кнопка `Подвести итог` активируется по обычным порогам содержательной сессии или по bypass-правилу `15 user-сообщений` в текущем backlog
- Диктовка в чате не должна зависеть от активного `isSending`: пока ассистент стримит текущий ответ, частичные и финальные транскрипции всё равно обязаны попадать в поле ввода
- Защита от устаревших dictation callbacks должна быть session-based, иначе после stop/restart или системного permission prompt старые `partial/final` могут перетирать новое состояние
- На mobile старт диктовки не должен автоматически переводить textarea в focus: текст обязан вставляться в поле без принудительного поднятия клавиатуры
- Для native dictation listeners `partialResults/listeningState/end` должны регистрироваться до `SpeechRecognition.start()`, иначе первые фразы теряются, а JS silence timer может преждевременно остановить запись
- Для mobile dictation scene-audio lock должен браться прямо в `useVoiceDictationInput` до `SpeechRecognition.start()`, а не через отдельный watcher по `speechStore.isListening`, иначе iOS запускает микрофон параллельно с `AudioPlayer stop/destroy` фоновой сцены
- Когда диктовка завершилась автоматически по таймеру тишины, `scene audio focus` всё равно должен освобождаться по факту перехода `speechStore.isListening -> false`, а не только из ручного `stopListening()`
- На iOS dictation не должна запускать длинный native fade сцены во время старта микрофона: bridge-flood из серии `AudioPlayer.setVolume(...)` ухудшает распознавание и обрубает транскрипцию
- Android speech plugin `stop()` обязан завершать plugin call (`call.resolve()`), иначе JS `await stop()` зависает и кнопка микрофона остаётся в состоянии активной записи

## Медитации

- Каталог `/meditations`, детальный плеер через query `trackId`
- Таблицы: `meditation_tracks`, `meditation_favorites`
- Web/legacy: Web Audio API для loop-треков (бесшовный цикл), HTMLAudio fallback для non-loop
- iOS/Android native: все meditation-треки идут через MediaGrid `AudioPlayer` (`@mediagrid/capacitor-native-audio@2.3.2`) с CDN URL и `useForNotification: true`
- Native loop: для треков с `isLoop=true` включается `loop: true` на уровне плагина; на iOS это `AVPlayerLooper`, на Android - ExoPlayer `REPEAT_MODE_ONE`
- Repeat обычных non-loop треков реализуется через `onAudioEnd` → `seek(0)` → `play()`, чтобы не переводить длинные обычные медитации в native loop mode
- Системный плеер iOS/Android для медитаций минимальный: только активный play/pause/toggle, без seek/previous/next controls. На Android это ограничение применяется только к внешним/system controllers; internal MediaGrid controller приложения должен сохранять полный набор команд для `setMediaItem()`/`prepare()`/`play()`
- Android sleep timer дополнительно ставится в native MediaGrid-патч через `scheduleStop`, чтобы остановка сработала при lockscreen/background, даже если JS timers в WebView заморожены
- При выборе WebAudio/HTMLAudio не используется эвристика `durationSeconds > 300`; для loop-треков ограничение идёт по фактическому размеру буфера
- Native route не падает в WebAudio/HTMLAudio fallback при ошибке MediaGrid, иначе старый проблемный путь снова маскирует реальные native-ошибки
- iOS MediaGrid `destroy()` обязан сначала удалить `AudioSource` из внутреннего registry и только потом best-effort деактивировать `AVAudioSession`; иначе после микрофона source может «застрять», а следующий `create(scene_*)` падает на `already exists`
- Для iOS `artworkSource` с remote URL должен принимать и `http`, и `https`; нельзя интерпретировать `http://...` как локальный путь `file:///.../public/http://...`
- Контекст очереди: перемотка вперёд/назад по выбранной секции
- Медиафайлы версионируются по content-hash, CDN кэш бессрочный
- В mobile release локальный каталог `public/meditations` не бандлится: аудио/обложки/фоны должны загружаться с `mediaBaseUrl` (`https://media.mentala.app` в production)

## Фоновая сцена (`/scene-selection`)

- Фиксированный каталог в `app/lib/sceneSelectionCatalog.ts`
- Настройки в `/api/user/me` → `sceneSettings`
- Native iOS/Android: сцены используют тот же MediaGrid `NativeAudioService`, что и медитации; web/legacy: loop-сцены остаются на WebAudio, non-loop — HTMLAudio fallback
- MediaGrid source сцены уничтожается при старте медитации, потому что системный native-плеер и `useForNotification` должны перейти к медитации
- Глушение при активном медитационном аудио: при старте медитации вызывается `sceneAudio.suspend()`, после остановки/паузы медитации layout watcher возвращает сцену через `sceneAudio.resume()`, если она играла до suspend
- На iOS voice dictation не должна отпускать scene audio по раннему JS-флагу: scene lock снимается только после завершения native `SpeechRecognition.stop()`, иначе сцена может вернуться слишком рано и создать гонку с медитационным `AudioPlayer`
- Для iOS speech-recognition `AVAudioSession.setActive(true)` не должен использовать `notifyOthersOnDeactivation`: этот флаг нужен только при деактивации сессии
- Если медитация завершилась по таймеру, пока приложение в фоне или под локскрином, сцена не должна автозапускаться до возврата приложения в active state
- `backgroundPlayMinutes`: 0 = стоп в background, N > 0 = стоп через N минут

## Онбординг (`/onboarding`)

- 5 шагов: имя, причина, возраст, пол, tone
- `users`: `gender`, `age_range`, `onboarding` (jsonb)
- `user_preferences.onboarding_reasons` — мультивыбор, порядок = приоритет
- `tone`: gentle | balanced | uplifting | direct
- Отдельный фоновый слой из `public/onboarding/welcome`

## Аутентификация (`/auth`)

- Для входа поле e-mail размечается как `autocomplete="username"`, пароль — `autocomplete="current-password"`
- Для регистрации поле имени размечается как `autocomplete="name"`, e-mail — `autocomplete="email"`, пароль — `autocomplete="new-password"`
- У auth-полей должны быть стабильные `id`/`name`, отключённые `autocapitalize`/`spellcheck` для e-mail и валидные `type="email"` / `type="password"`
- В Capacitor native-сборках поведение password manager зависит не только от HTML, но и от origin WebView: если приложение загружено с `server.url`, `http://localhost` или `capacitor://localhost`, iOS Keychain / Android credential sharing могут не связать форму с production-доменом сайта
- Для Android-связки сайта и приложения `/.well-known/assetlinks.json` должен содержать не только `delegate_permission/common.handle_all_urls`, но и `delegate_permission/common.get_login_creds`

## Дневник благодарности (`/practices/gratitude-diary`)

- Overview (streak + история) и editor (вопрос + worksheet + composer)
- Entitlement `gratitude.diary.full`, premium-ограничения для worksheet/photo
- API: GET/POST/PATCH `/api/gratitude-diary/*`, upload-photo staged-flow
- Избранные промпты: `gratitude_diary_favorite_prompts` (catalog + custom, лимит 50)
- Streak: timezone-aware, по локальному дню пользователя
- Фото: staged-flow (upload только при save, compensating cleanup при ошибке)

## Лендинг (`apps/landing`)

- Отдельная Nuxt-сборка для SEO, SSR + SWR
- Домены: `mentala.app` (лендинг), `my.mentala.app` (продукт + API)
- API: `/api/landing/config` (cache 60s), `/api/landing/lead` (rate-limit + honeypot)
- Деплой: `pnpm landing:generate` → статика → rsync на сервер, Nginx + Traefik
- CI/CD: deploy-prod.yml / deploy-dev.yml, атомарное переключение symlink
- Главные SEO-тексты лендинга должны подсвечивать реальный набор фич: ИИ-чат, SOS/дыхательные практики, медитации, дневник благодарности, полезные привычки и сценарии отказа от вредных привычек
- В SEO-формулировках про тарифы и доступ избегать неестественного CTA-стиля; писать фактически и кратко: бесплатный режим доступен сразу, новым пользователям можно сообщать про `7 дней Premium`
- В секции `Приватность и безопасность` есть короткий публичный disclosure про Google Sign-In: только базовые данные аккаунта для входа, без доступа к Gmail/Drive/Calendar
- FAQ на лендинге рендерится полностью закрытым по умолчанию; раскрытие только по явному клику пользователя
- Android promo-блоки на лендинге не отображаются на Apple-устройствах (`macOS`, `iOS`, `iPadOS`, включая iPadOS desktop mode), пока Android-приложение является единственным нативным install-сценарием
- `mentala.app` хранит основной SEO-контур: canonical, hreflang, JSON-LD, sitemap, robots и verification meta
- Для RU-рынка корневой URL `/` всегда отдаёт русский контент; locale autodetect по cookie, `Accept-Language` и browser locale для SEO-страниц запрещён
- `?lang=en` остаётся только как явный UI-режим и должен быть закрыт от индексации через `noindex`
- Marketing attribution: `mentala.app` читает whitelisted UTM/click-id (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `yclid`, `fbclid`, `ttclid`), хранит latest touch 90 дней в localStorage и передаёт их на `my.mentala.app`; продуктовый клиент удерживает pending attribution и backend пишет append-only историю в `user_marketing_attributions`.

## SEO продуктового хоста (`my.mentala.app`)

- Продуктовый shell работает как SPA и должен быть глобально закрыт от индексации через `robots` meta
- `robots.txt` на `my.mentala.app` должен запрещать индексацию продуктового хоста целиком
- У продуктового хоста не должно быть отдельных SEO-entry страниц, пока не появится отдельная продуктовая стратегия индексации

## Компоненты и паттерны

- `HorizontalScroller.vue` — горизонтальные ленты с drag, стрелками на desktop
- `StateBlock` — idle/loading/empty/error
- `ButtonLoader.vue` — спиннер внутри кнопки
- Pinia stores: ui, user, chat
- DTO: Zod, `shared/dto/index.ts`
- Referral share-кнопка должна открывать системный share-sheet на iOS/Android через `@capacitor/share`; если на web/browser шаринг недоступен, допустим fallback в copy с явным toast-сообщением, что текст именно скопирован

## Бренд-ассеты

- Web/favicon мастер с rounded-card подложкой: `public/app-icon-web-master.svg`
- Продакшен favicon для web и landing: `public/favicon.svg`
- Apple-safe мастер для native iOS/AppIcon: `public/app-icon-native-master.svg` (квадратный фон, без прозрачности и без преднарисованных скруглений)
- `apps/landing/public/favicon.svg` синхронизировать с `public/favicon.svg`
- Web PNG/ICO/apple-touch/android/ms/manifest family генерировать из rounded-card мастера с прозрачным фоном вне скруглённой карточки
- Для текущего PWA splash/launcher используем прозрачный брендовый знак, визуально совпадающий с native-иконкой; белую rounded-card подложку в manifest-иконках использовать нельзя
- Для PWA splash/loader и web push нельзя использовать устаревший `notification-badge.png`; актуальные `icon`/`badge` должны идти из прозрачного брендового знака, синхронизированного с native-иконкой
- Native iOS/AppIcon генерировать отдельно из Apple-safe мастера без предскругления
- Native Android launcher icon и splash генерировать отдельно из Apple-safe мастера: launcher через adaptive icon layers, splash — как отдельный тёмный launch screen со знаком бренда
- Native iOS single-size AppIcon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/favicon_ios.png`
- Native iOS launch splash: `ios/App/App/Assets.xcassets/SplashBackdrop.imageset/*` + `ios/App/App/Assets.xcassets/SplashMark.imageset/*`
- iOS native-ассеты пересобирать командой `pnpm assets:ios`: `AppIcon` собирается той же светлой launcher-композицией, что и квадратный Android launcher icon (единая фон-подложка + тот же знак бренда), а launch splash состоит из отдельных backdrop/mark ассетов для storyboard
- Для iPhone launch screen не должен быть одним полноэкранным bitmap со встроенным знаком: стабильный вариант для `LaunchScreen -> Capacitor SplashScreen` — раздельные `SplashBackdrop` и центрированный `SplashMark` в storyboard, иначе возможен заметный сдвиг знака из-за различий `scaleAspectFill`
- Для iOS рабочая схема сейчас такая: launch splash оставляем включённым, но скрываем вручную после готовности первого кадра через `SplashScreen.hide(...)`; вариант с `launchShowDuration: 0` даёт тёмный старт без логотипа и не использовать его как основную конфигурацию
- Для iOS `StatusBar.overlaysWebView` нельзя задавать как `false` в native config и потом переключать на `true` из JS: это даёт поздний пересчёт стартовой геометрии и визуальный скачок splash/logo
- Для `SplashScreen` в Capacitor не включать spinner и не держать искусственно длинный показ: на iPhone допустима короткая минимальная выдержка для аккуратного старта, на Android искусственную задержку лучше не добавлять и скрывать splash сразу после готовности первого кадра
- Android native-ассеты пересобирать командой `pnpm assets:android`: adaptive icon собирается из светлого брендового background layer + foreground знака, а splash заменяет дефолтный Capacitor во всех `drawable*`
