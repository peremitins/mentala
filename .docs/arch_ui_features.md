# UI и фичи

## Практики (хаб `/practices`)
- Медитации, дыхательные практики, быстрая помощь, дневник благодарности
- Дыхательные: каталог в `app/lib/breathPracticesCatalog.ts`, плеер `BreathPracticePlayer.vue` + `BreathOrb.vue`
- Голосовые подсказки фаз из `public/breath/voice/{informal|formal}/*.mp3`
- На mobile/web голосовые фазы дыхания идут через `Howler` с `html5: true` и unlock-retry: это основной защитный путь для Android WebView
- Voice/cue для дыхательных практик обязаны делать `unload()` при выключении канала и `unmount`, иначе в Android WebView быстро истощается глобальный `Howler.html5PoolSize` и отдельные фазы начинают пропадать
- Если голос или cue включают во время уже идущей практики, плеер сразу синхронизирует текущую фазу, а не ждёт следующий переход
- Кастомные практики: 1-30 сек фазы, 2-4 фазы, хранение в localStorage/Capacitor Preferences

## Быстрая помощь (`/quick-help`)
- 5 карточек: 5-4-3-2-1, Дыхание, Сброс напряжения, Выговориться, Выгрузка мыслей
- Входы: PageHeader, хаб практик, chat suggested chips (`open_sos`)
- Выгрузка мыслей: `/quick-help/thought-dump`, textarea + голосовой ввод, handoff в чат через `entryContext`

## Медитации
- Каталог `/meditations`, детальный плеер через query `trackId`
- Таблицы: `meditation_tracks`, `meditation_favorites`
- Web Audio API для loop-треков (бесшовный цикл), HTMLAudio fallback для non-loop
- iOS: `@capgo/native-audio`; Android медитации используют тот же HTMLAudio/WebAudio стек, что и `scene-selection`, чтобы background timer работал единообразно
- Контекст очереди: перемотка вперёд/назад по выбранной секции
- Медиафайлы версионируются по content-hash, CDN кэш бессрочный
- В mobile release локальный каталог `public/meditations` не бандлится: аудио/обложки/фоны должны загружаться с `mediaBaseUrl` (`https://media.mentala.app` в production)

## Фоновая сцена (`/scene-selection`)
- Фиксированный каталог в `app/lib/sceneSelectionCatalog.ts`
- Настройки в `/api/user/me` → `sceneSettings`
- Loop-сцены: WebAudio (бесшовный цикл), non-loop: HTMLAudio fallback
- Глушение при активном медитационном аудио
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
- В секции `Приватность и безопасность` есть короткий публичный disclosure про Google Sign-In: только базовые данные аккаунта для входа, без доступа к Gmail/Drive/Calendar
- FAQ на лендинге рендерится полностью закрытым по умолчанию; раскрытие только по явному клику пользователя

## Компоненты и паттерны
- `HorizontalScroller.vue` — горизонтальные ленты с drag, стрелками на desktop
- `StateBlock` — idle/loading/empty/error
- `ButtonLoader.vue` — спиннер внутри кнопки
- Pinia stores: ui, user, chat
- DTO: Zod, `shared/dto/index.ts`

## Бренд-ассеты
- Web/favicon мастер с rounded-card подложкой: `public/app-icon-web-master.svg`
- Продакшен favicon для web и landing: `public/favicon.svg`
- Apple-safe мастер для native iOS/AppIcon: `public/app-icon-native-master.svg` (квадратный фон, без прозрачности и без преднарисованных скруглений)
- `apps/landing/public/favicon.svg` синхронизировать с `public/favicon.svg`
- Web PNG/ICO/apple-touch/android/ms/manifest family генерировать из rounded-card мастера с прозрачным фоном вне скруглённой карточки
- Native iOS/AppIcon генерировать отдельно из Apple-safe мастера без предскругления
- Native Android launcher icon и splash генерировать отдельно из Apple-safe мастера: launcher через adaptive icon layers, splash — как отдельный тёмный launch screen со знаком бренда
- Native iOS single-size AppIcon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/favicon_ios.png`
- Native iOS launch splash: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png`
- iOS native-ассеты пересобирать командой `pnpm assets:ios`: `AppIcon` собирается той же светлой launcher-композицией, что и квадратный Android launcher icon (единая фон-подложка + тот же знак бренда), а splash — из того же мастера, но только со знаком бренда без фоновой карточки
- Для `SplashScreen` в Capacitor не включать spinner и не держать искусственно длинный показ: визуал должен быть чистым и без ощущения дефолтного Capacitor
- Android native-ассеты пересобирать командой `pnpm assets:android`: adaptive icon собирается из светлого брендового background layer + foreground знака, а splash заменяет дефолтный Capacitor во всех `drawable*`
