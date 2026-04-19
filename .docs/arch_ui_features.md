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
- Контекст очереди: перемотка вперёд/назад по выбранной секции
- Медиафайлы версионируются по content-hash, CDN кэш бессрочный
- В mobile release локальный каталог `public/meditations` не бандлится: аудио/обложки/фоны должны загружаться с `mediaBaseUrl` (`https://media.mentala.app` в production)

## Фоновая сцена (`/scene-selection`)

- Фиксированный каталог в `app/lib/sceneSelectionCatalog.ts`
- Настройки в `/api/user/me` → `sceneSettings`
- Native iOS/Android: сцены используют тот же MediaGrid `NativeAudioService`, что и медитации; web/legacy: loop-сцены остаются на WebAudio, non-loop — HTMLAudio fallback
- MediaGrid source сцены уничтожается при старте медитации, потому что системный native-плеер и `useForNotification` должны перейти к медитации
- Глушение при активном медитационном аудио: при старте медитации вызывается `sceneAudio.suspend()`, после остановки/паузы медитации layout watcher возвращает сцену через `sceneAudio.resume()`, если она играла до suspend
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
- `mentala.app` хранит основной SEO-контур: canonical, hreflang, JSON-LD, sitemap, robots и verification meta
- Для RU-рынка корневой URL `/` всегда отдаёт русский контент; locale autodetect по cookie, `Accept-Language` и browser locale для SEO-страниц запрещён
- `?lang=en` остаётся только как явный UI-режим и должен быть закрыт от индексации через `noindex`

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
- Native iOS launch splash: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png`
- iOS native-ассеты пересобирать командой `pnpm assets:ios`: `AppIcon` собирается той же светлой launcher-композицией, что и квадратный Android launcher icon (единая фон-подложка + тот же знак бренда), а splash — из того же мастера, но только со знаком бренда без фоновой карточки
- Для `SplashScreen` в Capacitor не включать spinner и не держать искусственно длинный показ: визуал должен быть чистым и без ощущения дефолтного Capacitor
- Android native-ассеты пересобирать командой `pnpm assets:android`: adaptive icon собирается из светлого брендового background layer + foreground знака, а splash заменяет дефолтный Capacitor во всех `drawable*`
