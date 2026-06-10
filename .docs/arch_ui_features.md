# UI и фичи

## Практики (хаб `/practices`)

- Медитации, дыхательные практики, быстрая помощь, дневник благодарности, оценка состояния
- На хабе `/practices` платные медитации, дневник благодарности и оценка состояния не закрываются заранее: карточки ведут внутрь разделов без раннего lock. Paywall показывается на потребляющем действии: запуск медитации, избранное/управление треком, сохранение записи дневника, premium-фото или кастомизация worksheet, прохождение опросника и получение результата.
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

## Оценка состояния (`/practices/assessments`)

- Раздел находится внутри практик и использует продуктовую рамку самонаблюдения, а не медицинской проверки. В UI основной термин — «Оценка состояния», внутри раздела — «опросник»; не использовать формулировки про диагноз, лечение или расстройство.
- Активные опросники: `anxiety_check_v1` / «Оценка тревоги» (валидированная шкала **GAD-7**) для сада `calm_anxiety_30` / «Спокойствие» и `self_compassion_scs_sf_v1` / «Оценка доброты к себе» (валидированная шкала **SCS-SF**) для сада `self_kindness_21` / «Доброта к себе». Вопросы и подсчёт — в исходном валидированном виде, но в UI результат подаётся как самонаблюдение: без ИИ, без клинических claims и без слов «диагноз»/«расстройство», заголовки шкал в интерфейсе не показываются. Самодельный `self_kindness_v1` удалён — сад использует SCS-SF.
- `GET /api/assessments` и `GET /api/assessments/:slug` являются preview endpoint-ами: требуют авторизацию, но не требуют подписку. В ответе для активных опросников может приходить опциональный `lastAttempt` с id последней попытки, чтобы UI мог открыть последний результат из списка или detail-экрана. Будущие опросники отображаются как `coming_soon` с текстом «Откроется вместе с будущим садом».
- Потребляющее действие закрывается через `assessments.full`: gated runner API, отправка ответов, результат, история, график и baseline/final-замеры сада должны проверять entitlement на сервере. Одного frontend paywall недостаточно. Gated endpoint-ы: `GET /api/assessments/:slug/run`, `POST /api/assessments/:slug/attempts`, `GET /api/assessments/:slug/attempts/:attemptId`, `GET /api/assessments/:slug/history`, `GET /api/assessments/:slug/chart`.
- UI runner находится на `/practices/assessments/:slug/run`: intro, один вопрос на экран, крупные touch targets, progress bar, постоянный контекст периода ответа, fade-only Vue `Transition`, loading/error states. Экран результата `/practices/assessments/:slug/results/:attemptId` показывает band, deterministic explanation, сравнение с предыдущей попыткой, safety-текст и SVG-график динамики без дублирования итогового текста.
- Попытки хранятся в `assessment_attempts`: `assessment_slug`, `assessment_version`, `source`, `linked_program_slug`, `linked_program_attempt_id`, `total_score`, `band_id`, `result_snapshot`, `answers`, `user_date`, `timezone`, `completed_at`. Для chart показывается одна точка за `user_date`: если в один день несколько попыток, берётся последняя завершённая попытка текущей версии опросника.
- Baseline/final-замеры садов не добавляют новый Roadmap action type. Для совместимости web/iOS/Android они идут как существующий `guided_steps` с `formKind='assessment_prompt'`, `targetId=<assessmentSlug>` и `template='program_baseline' | 'program_final'`. Новый web-клиент рендерит отдельный assessment prompt и возвращается из runner с `assessmentAttemptId`; старые клиенты остаются на известном `guided_steps` fallback и могут продолжить шаг.

## Быстрая помощь (`/quick-help`)

- 5 карточек: 5-4-3-2-1, Дыхание, Сброс напряжения, Выговориться, Выгрузка мыслей
- Входы: PageHeader, хаб практик, chat suggested chips (`open_sos`)
- `SOS / Снять напряжение в теле` использует cue `inhale/exhale` через `useBreathPracticeAudio`; mobile production route нужно прогревать заранее, иначе первый `clench` может пройти с voice, но без cue
- Для новых локальных настроек `SOS / Снять напряжение в теле` voice по умолчанию включён; уже сохранённый пользовательский toggle не перетирается
- Выгрузка мыслей: `/quick-help/thought-dump`, textarea + голосовой ввод, handoff в чат через `entryContext`
- iOS voice dictation через `@capacitor-community/speech-recognition` обязана переживать `No speech detected` без native-crash: plugin teardown должен быть nil-safe, `AVAudioEngine` очищается на main thread, а JS-движок не запускает двойной auto-restart после одного `stopped/end`

## Retention-главная и «Карта пути»

- Главная строится вокруг ежедневного сценария: существующая AI-карта остаётся первым CTA, дальше идут Mood Check-in, Streak, единый блок «Карта пути» и «Мысль дня». Старую сетку практик на главной не возвращать.
- Вкладка `/practices` остаётся в `BottomNav` и содержит «Быструю помощь» первым блоком; новый плавающий быстрый доступ в рамках retention-редизайна не добавляется.
- Данные главной собирает `GET /api/today`: mood за локальный день пользователя, streak, energy, текущая программа и thought-of-the-day.
- Streak на главной берётся из materialized state `user_streaks`, а не пересчитывается на лету из 30 последних дней. Старые поля `/api/today.streak.current/best/week` сохраняются; новые клиенты также получают `status`, `repair`, `pausedSince`, `notice`, `weekDetails` для обратной совместимости. Новая policy считает серию строго по последовательным локальным дням с реальной активностью: пропуск остаётся пропуском, следующая активность начинает новую серию с `current=1`, `best` сохраняет прошлый максимум. Экран `/streak` использует `GET /api/streak`, ручная пауза и возврат идут через `POST /api/streak/pause` и `POST /api/streak/resume`.
- Недельные капли показываются на главной отдельным блоком с P1-растением. Production-картинки растения лежат в `public/retention/plant/states` с именами `plant-01.webp` ... `plant-15.webp` (15 стадий; первая стадия — уже маленькое растение с зелёными листьями, отдельных кадров «семя/проросток» нет); состояние считается от `program.completedSteps`, а пороги роста рассчитываются динамически от `program.totalSteps / 15`, без таблиц под конкретные длины программ. При завершении нового шага используется staged success-сценарий: сначала несколько soft-confetti залпов отдельной прелюдией, затем fullscreen flyout через fixed/teleport-слой, после увеличения растения идёт полив, после попадания капель запускается длинная метаморфоза, затем удержание новой стадии и плавный возврат. Капли внутри fullscreen-слоя должны компенсировать масштаб растения, оставаться маленькими и падать в область горшка/корней, а не разлетаться по экрану. Overlay можно пропустить тапом/кнопкой или Escape, scroll на время анимации блокируется. На главной не должно быть постоянного idle-плавания растения; после mood/thought reward разрешён только короткий inline-полив. Картинка открывается крупно через общий PhotoSwipe composable из дневника благодарности. Пока production-картинки не загружены, UI падает назад на старые 7 SVG-стадий из `public/retention/plant`. Weekly ring считается от `energy.weekly / energy.weeklyGoal`, но в тексте UI не использовать формат `153 / 25`: показывать факт недели и отдельную короткую подпись к цели.
- «Мысль дня» хранится в `daily_thoughts`: `GET /api/thought-of-the-day` отдаёт canonical fallback/AI-текст на дату, `POST /api/thought-of-the-day/save` сохраняет в коллекцию и начисляет 1 каплю только при первом сохранении, `DELETE /api/thought-of-the-day/save` убирает из коллекции без списания капель, `GET /api/thoughts/collection` отдаёт сохранённые мысли.
- Roadmap использует маршруты `/programs/[slug]/map` и `/programs/[slug]/steps/[step]`; полный экран карты открывает bottom sheet по шагу.
- На мобильных экранах основной app layout включает `mobile-compact-type`: крупные Tailwind text-utilities внутри приложения сжимаются до 10-14px диапазона, чтобы roadmap-практики, чат и CTA не теряли место. Touch targets при этом остаются через `min-h-*`, а не через размер шрифта.
- Пройденный шаг можно повторить: `POST /api/programs/:slug/steps/:step/start` создаёт новый attempt с `replay=true`, но canonical progress и completion bonus не пересчитываются повторно.
- Дневной лимит Roadmap обновляется без перезагрузки страницы: `programDailyLimit.nextResetAt` считается мягким unlock-моментом, после которого stale snapshot больше не блокирует CTA, а клиент делает один точечный refresh `/api/today`. В production `nextResetAt` — локальная полночь следующего календарного дня пользователя; в dev `.env.development` задаёт короткий cooldown через `NUXT_PRIVATE_DAILY_STEP_WINDOW_MS=60000`.
- Будущие шаги видны как нарративный preview, но не блокируют свободные практики: дыхание, медитации, дневник и быстрая помощь доступны через `/practices`.
- В шагах программы не дублировать mood-вопрос, если mood за локальный день уже есть; reflection после практики необязательная и оформляется как chips + опциональный текст/голос, без блокировки завершения. После одного только mood check-in не показывать экран «Как прошло?» — текстовые/reflection-only шаги должны сразу переходить к своему смысловому prompt.
- Timed-практики Roadmap (`breathing`, `quick_help_breathing`, `quick_help_tension`, `meditation`) используют `durationSeconds`/`minDurationSec` как минимальное время выполнения. `completionDelaySeconds` допускается только для timed-практик как время разблокировки нижнего CTA; для `journal_entry`, `micro_reflection`, `rating_scale`, `next_route_choice` оно не используется. Embedded-плеер в Roadmap не обрывается на моменте разблокировки CTA: медитация ставит отдельный Roadmap sleep timer на 60 минут без перезаписи пользовательского таймера страницы медитаций, дыхание и tension-практики получают фиксированную сессию 60 минут. Таймер разблокировки стартует от фактического запуска практики, ставится на паузу вместе с практикой и показывается прямо в тексте нижней кнопки.
- Timed-практики должны переживать background/reload через `timedPracticeRecovery` в `persistentStorage`: Roadmap сохраняет `attemptId/actionId`, свободные дыхание и медитации — `source/sourceId`. После reload достигнутая норма автоматически доотправляет существующие completion/energy endpoints; partial-progress фиксируется paused, чтобы скрытое время после восстановления не продолжало капать.
- Оценка длительности roadmap-шага в UI считается от фактических actions, а не от старого текстового поля `Время` в контентном описании. Если в шаге есть 8-10 минут медитации, AI-чат или weekly-check, показывать честный диапазон вроде «10-15 минут», а не короткое число из детального текста.
- Embedded-дыхание внутри roadmap обязано сохранять информационный блок паттерна фаз (`Вдох`, `Задержка`, `Выдох` и т.д.) под шапкой шага: этот блок не дублирует `ProgramStepHeader`, а объясняет текущий ритм практики.
- Глобальный mini-player медитации не показывается на `/programs/*`: в roadmap аудио-практики управляются embedded-компонентами, а нижняя зона зарезервирована под CTA шага и bottom nav.
- Embedded-практика `quick_help_grounding` после загрузки сохранённых voice-настроек должна озвучивать первый шаг автоматически, если тумблер «Голос» включён; переходы «Дальше/Назад» продолжают озвучивать текущий индекс.
- Дневниковые и текстовые roadmap-action'ы с `required: true` (`journal_entry`, `thought_dump`, `ai_reflection`, `micro_reflection`, `rating_scale`, `structured_form`, `guided_steps`, `weekly_check`) не пропускаются пустыми: CTA активируется после непустого текста, выбранного chip, значения шкалы или заполненных обязательных полей. Для `journal_entry` учитывать формат из контентного blueprint: `oneLine` до 160 символов, `short` до 500, `structured` до 1200. Optional `journal_entry` и optional `weekly_check` можно пропустить без текста. `rating_scale` строится по `scaleMin`/`scaleMax`; в шаге 5 он отрабатывает split-flow: первый slider до запуска дыхания, второй slider сразу после завершения дыхания, хотя в blueprint это может быть один action.
- Roadmap prompt с нумерованным перечислением (`1)`, `2)`, `3)`) рендерится как отдельный список, где каждый пункт начинается с новой строки. Placeholder текстовых полей должен соответствовать `required`: про «можно пропустить» писать только для optional action.
- Roadmap поддерживает typed actions для реальных практик: `meditation`, `quick_help_grounding`, `quick_help_breathing`, `quick_help_tension`, `thought_dump`, `guided_steps`. Их нельзя подменять reflection-текстом: каждый тип должен вести в отдельный embedded-компонент с собственной логикой выполнения.
- Лёгкие non-practice actions (`micro_reflection`, `rating_scale`, `next_route_choice`, `weekly_check`) тоже должны иметь отдельный UI, а не маскироваться под `ai_reflection`: chips без AI, slider 0-10 для интенсивности тревоги/напряжения, отдельный выбор маршрута там, где он реально нужен, короткая проверка динамики. `micro_reflection` по умолчанию single-choice; multi-choice включается только явным `chipMode`. Лёгкое действие считается meaningful только если оно закрепляет конкретный эффект предыдущей практики, а не является декоративным опросом.
- Инфраструктура v5 actions добавляет `structured_form`, `guided_steps`, `weekly_check` как обычные элементы JSONB `actions[]`: поля DTO optional, старые action-типы не удаляются. Step runner рендерит эти типы отдельными компонентами (`ProgramStructuredFormAction`, `ProgramGuidedStepsAction`, `ProgramWeeklyCheckAction`), сохраняет output в attempt action и восстанавливает draft из `action.output` при возврате/resume. `experiment_status` — отдельный field-type внутри `structured_form` для асинхронных статусов `done`, `partly`, `planned_later`, `need_smaller`, `not_yet`.
- `guided_steps.formKind='support_request_script'` — чеклист подготовки плюс одно обязательное поле итоговой просьбы. Верхние пункты остаются кликабельными `completedStepIds`, а нижний общий `GratitudeDiaryEmbeddedComposer` с голосовым вводом сохраняется в `scriptText`; старые `stepTexts` используются только как legacy-draft fallback при resume.
- В `calm_anxiety_30` шаг 28 (`calm_toolkit`) выбирает техники через `choice` + `mode='multiple'`, а не через textarea. Ограничения по количеству выбранных техник нет; в UI достаточно короткого prompt и списка вариантов, без help-тултипа и дополнительного текстового поля. Отчёты разворачивают сохранённые option id в человекочитаемые labels перед показом и LLM-промптом.
- Вводный текст и мини-статья шага хранятся в `program_step_templates.metadata` как optional `introText`/`miniArticle` и отдаются в `ProgramStepDto` backward-compatible полями. В `calm_anxiety_30` они дополнительно становятся первым `guided_steps` action с `formKind: 'step_intro'`, чтобы intro было отдельным экраном прогресса и корректно сохранялось/resume'илось вместе с actions. Step runner больше не рисует отдельный intro-блок поверх первого вопроса; при изменении template незавершённый started-attempt синхронизирует actions с актуальным template, сохраняя `status`/`output` уже совпавших action по `id`.
- Длительность roadmap-шага вычисляется сервером из фактических actions: timed-практики, `ai_chat_session.minDurationSec`, structured forms, guided steps, weekly-check и reading estimate по текстам action/шага. `durationLabel` optional и строится сервером; `durationMin` остаётся числовым backward-compatible полем.
- Embedded `ai_chat_session` в Roadmap использует `ChatRoom` с отдельным `entryContext` конкретного шага (`program_slug`, `step_number`, `topic_prompt`, `goal_hint`) и не восстанавливает backlog обычного `/chat`. Текстовый чат и Realtime Voice оба получают Roadmap developer-prompt с темой шага. При «Дальше» активный Realtime Voice сначала корректно останавливается и сбрасывает transcript в `historyAnchorTherapySessionId`, затем вызывается `finalize({ reason: 'roadmap_next' })`: summary создаётся для истории сессий по Roadmap-only eligibility, затем клиентский store очищается, чтобы следующий AI-шаг стартовал пустым.
- Reflection после практики не выводит `prompt` как отдельный вопрос под chips: chips отвечают на общий вопрос «как прошло», а `prompt` используется только там, где пользователь пишет текстовый ответ (`journal_entry`, `thought_dump`).
- Текущий runtime-контент первого сада `calm_anxiety_30` перенесён на `.docs/content/program_calm_anxiety_30_v5.md`: один главный терапевтический фокус шага, вводные тексты для всех 30 шагов, 24 мини-статьи с internal `sourceNotes`, обязательный practice-костяк из готовых embedded-компонентов (`breathing` 14, `meditation` 9, `quick_help_grounding` 7, `quick_help_tension` 3, `ai_chat_session` 7), `structured_form` 10, `weekly_check` после шагов 7/14/21 и перед финальным completion шага 30, плюс асинхронный сценарий поведенческого эксперимента между шагами 24-25.
- `mood_checkin` в Roadmap не считать практикой и не использовать как способ сделать шаг «непустым». Он допустим как контекст дня в первом шаге или отдельный daily check-in на главной, но не заменяет дыхание, grounding, journal, thought dump, медитацию или AI-разбор.
- Timed-практики первого сада прогрессируют от 3-4 минут в первых шагах до 10 минут в финале; 15 минут допускаются только как optional extension после completion, без блокировки нижнего CTA.
- Roadmap первого сада может добавлять новые action-типы до production mobile-релиза. Для v5 целевой набор расширения: `structured_form` для карточек и планов, `guided_steps` для коротких пошаговых практик без аудио, `weekly_check` для проверки динамики. Уже добавленные `micro_reflection`, `rating_scale`, `next_route_choice` остаются базовыми lightweight actions.
- `journal_entry` в v5 используется там, где он закрепляет смысл шага, но не обязан быть ежедневной письменной домашкой: часть рефлексий вынесена в `structured_form`, `micro_reflection`, `weekly_check` и `ai_chat_session`.
- Safety-контур: явные проверки состояния не должны подсказывать пользователю рискованные формулировки и не должны автоматически раскрывать отдельную панель с кнопками SOS/чат внутри Roadmap-action. Тяжёлые ответы сохраняются как данные шага, а живую поддержку приложение может рекомендовать нейтральным текстом вне декоративной анкеты. Новые/резкие телесные симптомы нельзя автоматически объяснять тревогой: нужен medical-support текст. В v5 шаги 24-25 поддерживают асинхронный поведенческий эксперимент (`done`, `partly`, `planned_later`, `need_smaller`, `not_yet`), а шаг 25 не делает вид, что эксперимент выполнен, если пользователь только сохранил план. AI-chat actions не показывают встроенный safe-exit опросник над чатом: проверка прогноза идёт через сам разговор и следующую structured form. Практики перед действием снижают шум, но не становятся условием «сначала полностью успокойся, потом действуй». После шага 30 финальный `weekly_check` должен быть понятным триггером отчёта: нижняя CTA формулируется как «Сформировать итоговый отчёт», затем показывается анимация генерации и готовый отчёт. Не показывать выбор «пройти сад ещё раз» в этом месте.
- Success-экран roadmap-шагов запускает клиентское `canvas-confetti` с учётом `prefers-reduced-motion`.

## Чат (`/`)

- На главной CTA `История сессий` показывает только пульсирующую точку-индикатор, если есть непросмотренный пользовательский итог; текстовый бейдж `Новое` остаётся внутри списка `/session-summaries-user`
- В списке и detail-экране пользовательских итогов подпись `N сообщений` означает весь диалог целиком: сообщения пользователя и ответы ассистента, а не только user turns
- Пользовательский итог сессии может появиться не только после ручного `Завершить сессию`, но и после logout или nightly-обработки server-side idle-сессии
- При cold start страницы `/chat` клиент сначала пытается восстановить весь несуммаризованный transcript backlog с сервера; если история найдена, она гидрируется в `chat.messages`, и только при полном отсутствии backlog запускается приветственный auto-start
- Если восстановленный backlog уже относится к ended/stale billing-сессии, он всё равно показывается в UI, но первое новое сообщение стартует новую `therapySession`, не обнуляя старую историю
- Кнопка `Подвести итог` активируется по обычным порогам содержательной сессии или по bypass-правилу `15 user-сообщений` в текущем backlog
- Диктовка в чате не должна зависеть от активного `isSending`: пока ассистент стримит текущий ответ, частичные и финальные транскрипции всё равно обязаны попадать в поле ввода
- В одной активной textarea-диктовке `separator` применяется только между уже существующим текстом и новым voice-блоком; финальные mobile-transcript chunks внутри этой сессии склеиваются пробелом и дедуплицируются, потому что Web Speech может возвращать весь накопленный текст заново. Если `partial` уже показал первое слово новой фразы, а `final` вернул его дважды (`три три четыре`), commit должен схлопнуть только технический leading-duplicate
- `useSpeechEngine` должен держать один общий speech-engine instance и fan-out dispatcher для всех mounted textarea/composer-инстансов: реальные native/webspeech движки хранят один callback на событие, поэтому прямое повторное `engine.onPartial(cb)` перезаписывает обработчик последним textarea
- Защита от устаревших dictation callbacks должна быть session-based, иначе после stop/restart или системного permission prompt старые `partial/final` могут перетирать новое состояние
- Технический auto-restart Web Speech/native recognition после `onend` не должен сбрасывать `silenceMs`: таймер тишины продлевается только реальным speech-result, иначе мобильный браузер может держать микрофон включённым бесконечно
- На mobile старт диктовки не должен автоматически переводить textarea в focus: текст обязан вставляться в поле без принудительного поднятия клавиатуры
- Для native dictation listeners `partialResults/listeningState/end` должны регистрироваться до `SpeechRecognition.start()`, иначе первые фразы теряются, а JS silence timer может преждевременно остановить запись
- Для mobile dictation scene-audio lock должен браться прямо в `useVoiceDictationInput` до `SpeechRecognition.start()`, а не через отдельный watcher по `speechStore.isListening`, иначе iOS запускает микрофон параллельно с `AudioPlayer stop/destroy` фоновой сцены
- Для web/PWA dictation на iOS Safari `webkitSpeechRecognition.start()` должен вызываться синхронно внутри пользовательского жеста: перед ним нельзя делать `await` на permission query, `getUserMedia` или scene-audio suspend. `useSpeechEngine` создаёт webspeech singleton синхронно для web и дедуплицирует prewarm, чтобы несколько mounted composer'ов не создавали конкурирующие engine instance'ы.
- Runtime-ошибки Web Speech после `onerror` должны сначала проходить через `MicPermissionGate`; если gate уже открыл permission-модалку или обработал отказ, экран не должен дополнительно показывать fallback-тост «Диктовка недоступна». `service-not-allowed`/`network` в iOS Safari не считаются доказанным отказом микрофона.
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

- Шаги: имя, выбор тем, предложение напоминаний, возраст, пол, tone
- Выбор тем идёт после имени и использует каталоги `THERAPY_TOPICS` и `HABITS_CATALOG`: эмоциональное состояние, полезные привычки, отказ от вредных привычек
- `users.onboarding.selectedTopics` — структурный стартовый фокус пользователя: `{ kind: 'therapy' | 'habits', entityKey }[]`, максимум 5 тем
- Первый сад должен выбираться из `users.onboarding.selectedTopics`: `therapy:anxiety|stress|phobias -> calm_anxiety_30`, `therapy:selfesteem -> self_kindness_21`, `therapy:relations -> relationships_21`, `therapy:anger -> emotion_regulation_21`. Если целевой сад ещё не готов, fallback остаётся `calm_anxiety_30`, но в Оранжерее можно показать релевантный будущий сад.
- `calm_anxiety_30` не персонализировать условными текстами под отношения или привычки: для крупных тем нужны отдельные сады, иначе контентная методика становится размытой.
- `user_preferences.onboarding_reasons` остаётся legacy-слоем для текущей персонализации промптов и старого onboarding payload
- Экран напоминаний запрашивает системное push-разрешение только по явному нажатию `Включить уведомления`; выбранные темы всё равно сохраняются и активируют настройки напоминаний
- Незавершённый welcome-онбординг сохраняет draft формы и текущий шаг в `persistentStorage`: web использует `localStorage`, iOS/Android — Capacitor Preferences. Draft очищается после успешного завершения.
- `tone`: gentle | balanced | uplifting | direct
- Отдельный фоновый слой из `public/onboarding/welcome`

## Аутентификация (`/auth`)

- Для входа поле e-mail размечается как `autocomplete="username"`, пароль — `autocomplete="current-password"`
- Для регистрации поле имени размечается как `autocomplete="name"`, e-mail — `autocomplete="email"`, пароль — `autocomplete="new-password"`
- У auth-полей должны быть стабильные `id`/`name`, отключённые `autocapitalize`/`spellcheck` для e-mail и валидные `type="email"` / `type="password"`
- В Capacitor native-сборках поведение password manager зависит не только от HTML, но и от origin WebView: если приложение загружено с `server.url`, `http://localhost` или `capacitor://localhost`, iOS Keychain / Android credential sharing могут не связать форму с production-доменом сайта
- Для Android-связки сайта и приложения `/.well-known/assetlinks.json` должен содержать не только `delegate_permission/common.handle_all_urls`, но и `delegate_permission/common.get_login_creds`
- Локальная защита входа обязательна после авторизации: `appLock` хранит per-user PIN hash/salt только локально, `AppLockGate` в `app/app.vue` не рендерит приватный UI до setup/unlock, native использует `@capgo/capacitor-native-biometric` + `@aparajita/capacitor-secure-storage`, Web/PWA — PBKDF2 через Web Crypto и namespaced `localStorage`
- Native app-lock не должен блокировать route middleware или splash: storage/biometry инициализируются с fallback/timeout. Biometric prompt автозапускается при блокировке поверх единого PIN-экрана (отдельного промежуточного биометрического экрана нет); до resolve проверки доступности биометрии (`biometricChecked`) gate показывает нейтральный спиннер, чтобы PIN-экран не мелькал. Пока `biometricPromptInFlight`, appStateChange-события игнорируются (BiometricPrompt — отдельное окно, его показ выглядит как уход в фон и иначе вызывает мерцание/повторные lock). PBKDF2 использует Web Crypto, а для native dev-origin без `crypto.subtle` — JS fallback `@noble/hashes`
- Перед `createOrReplacePin`/`unlockWithPin` нужно дать Vue и браузеру отрисовать последнюю цифру OTP (`nextTick` + animation frame), иначе PBKDF2/verify может визуально подвесить клавиатуру до появления введённой цифры
- На публичных auth routes (`/auth`, `/auth/*`, `/forgot`, `/reset-password`) `AppLockGate` и lifecycle-lock не запускаются даже если в store ещё есть stale `auth.user`; при возврате приложения на экран авторизации PIN/biometry не показываются
- Во время `auth.isLoggingOut` и короткого logout quiet window `AppLockGate` не показывается, biometric prompt не запускается, in-flight `initializeForUser`/`auth.me` обязан игнорировать stale-result после `clearRuntime`, а logout-related `401` не должны давать toast/redirect; критичные pre-logout запросы отправляются до очистки session token, сам `/api/auth/logout` уходит в фоне с захваченным токеном
- Android privacy-screen для внешних Activity (`Google Sign-In`, biometric prompt) должен использовать `privacyModeOnActivityHidden: 'dim'`, не `splash`, иначе plugin показывает drawable `splash` и может визуально растянуть брендовый знак
- Обычный logout или временная смена `auth.user` не удаляют локальный app-lock record; удаление record допустимо только для явного “Забыли код?”/локального сброса или удаления аккаунта
- В настройках локальной защиты нельзя показывать отключение/удаление кода или биометрический toggle; допустимы только `Изменить код`, выбор `lockAfterSeconds` без варианта `Никогда`, `Заблокировать сейчас` и read-only статус биометрии
- App-lock PIN является per-device локальным секретом, а не серверным паролем аккаунта. Для старых native build без новых Capacitor plugins app-lock storage/biometry/privacy-screen должен graceful-fallback, иначе web-деплой может заблокировать вход до обновления приложения через сторы

- Android safe-area: нижний/боковые системные инсеты обрабатываются НАТИВНО в `MentalaSafeAreaPlugin` как layout-margin'ы WebView (zeroing approach из доки Android), вниз по иерархии systemBars/displayCutout передаются обнулёнными, IME-инсеты не трогаются. В JS публикуется только top (`--native-safe-area-inset-top`); bottom/left/right всегда 0. Нельзя возвращать web-слою ненулевой bottom — получится двойной отступ. Причина схемы: автоматика Chromium WebView (M139+) теряет insets-диспатчи в гонках с BiometricPrompt/launch-transition из Play Маркета («ghost padding»), из-за чего bottom-nav обрезался системной навигацией

## Дневник благодарности (`/practices/gratitude-diary`)

- Overview (streak + история) и editor (вопрос + worksheet + composer)
- Entitlement `gratitude.diary.full` блокирует сохранение/изменение записей, но read-only overview, prompt catalog и editor preview доступны, чтобы пользователь мог увидеть устройство дневника. Premium-ограничения для worksheet/photo остаются отдельными gates.
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
- Яндекс.Метрика: лендинг отправляет детальные CTA-события по месту клика (`landing_auth_redirect_click_*`, `landing_assessment_cta_click_*`, `landing_android_store_click_*`), а продуктовый SPA — post-click цели `registration_completed`, `onboarding_completed`, `app_tour_completed`, `assessment_completed`, `checkout_started`, `trial_started`, `subscription_activated`. Автоцели Метрики не использовать как primary optimization goals для Директа.

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
- `useToast` по умолчанию показывает синий `info`-тост; зелёный `success` нужно передавать явно только для подтверждений, где статус успеха важен визуально.
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

## Отчёты по программе (Сад)

Программа состоит из 30 шагов с контрольными точками на шагах 7, 14, 21 (`weekly_check` action c `placement='after_completion'`) и 30 (`placement='before_final_completion'`). На каждой контрольной точке после успешного завершения шага автоматически генерируется AI-отчёт.

На финальном шаге `weekly_check` выступает последним содержательным экраном перед отчётом. CTA должен прямо обещать результат: «Сформировать итоговый отчёт». После нажатия клиент завершает шаг, открывает full-screen анимацию подготовки отчёта и затем показывает `GardenPlantReportSheet`. Экран выбора «пройти сад ещё раз» на этом этапе не используется.

Серверная логика:

- `server/application/garden/garden-summary.service.ts` — финальный отчёт на 9 секций (4000-6000 знаков), используется на шаге 30. Хранится в `user_plants.user_summary` и дублируется в `user_program_checkpoint_summaries(checkpointStep=30, kind='final')`.
- `server/application/garden/garden-checkpoint-summary.service.ts` — промежуточные отчёты на 5 секций (1500-2500 знаков) для шагов 7/14/21. Накопленный анализ: данные с начала программы, акцент на динамике с предыдущей точки.
- `collectUserSignalsForProgram` (общая для обоих) тянет из `userProgramStepAttempts.actions[]`: `rating_scale` timeline тревоги, `weekly_check` ответы, `structured_form` цитаты, `journal_entry` + `thought_dump` фрагменты, `ai_reflection` + `micro_reflection` chips, `mood_checkins`. Для финального отчёта дополнительно подтягиваются связанные с садом `assessment_attempts` (`linked_program_slug`, `program_baseline`/`program_final`) и передаются LLM в блоке «Опросники оценки состояния, связанные с садом». Фильтр `isMeaningfulText` отбрасывает странные/случайные тексты юзера (минимум 12 символов, 3 слова, 6 уникальных букв).

API:

- `POST /api/programs/:slug/checkpoint-summary` — генерация (вызывается фронтом после weekly_check).
- `GET /api/programs/:slug/checkpoint-summary/:step` — получение/polling.
- `GET /api/programs/:slug/timeline` — все отчёты для активной программы.
- `GET /api/garden/plants/:id/timeline` — все отчёты для завершённой программы.

UI:

- `ProgramCheckpointReportPreparing.vue` — короткий polling overlay (до 30 сек).
- `GardenReportsTimeline.vue` — 4 точки (Этап 1, Этап 2, Этап 3, Финал).
- `MoodAnxietyChart.vue` — area chart на ApexCharts (vue3-apexcharts) с двумя сериями.
- `GardenActiveCard.vue` — плашка «N отчётов о твоём пути» с переходом в `GardenPlantReportSheet`.
- `GardenPlantReportSheet.vue` дополнен timeline-переключателем между точками и графиком.
- Интеграция в `app/pages/programs/[slug]/steps/[step].vue` через `watch(isCompleted)`: после шага 7/14/21 c `weekly_check` action триггерится preparing → sheet.

Стиль AI-промптов:

- Запрещены длинные тире (—), эмоджи, лозунги типа «ты молодец», англицизмы, императив «должен».
- Запрещена привязка к календарю («за неделю», «за месяц») — у разных юзеров путь идёт с разной скоростью. Используются нейтральные термины: «на этом отрезке», «между шагами X и Y», «с прошлой контрольной точки».
- Цитировать пользователя только если текст осмысленный (фильтр `isMeaningfulText`). Случайные «ааа», «test», одиночные слова — пропускаются.
