# Архитектура: Продуктовый тур (App Tour)

## Цель и контекст

В приложении уже есть **welcome-онбординг** (`/app/pages/onboarding.vue`, поле `user.onboarding.welcome`) — это setup-визард, в котором пользователь указывает имя, темы, тон, возраст и т.д. После него юзер попадает на главную и **не понимает, что и где находится**: где голосовой режим, что такое «подвести итог», зачем нужны напоминания, и так далее.

**App Tour** — это **второй этап онбординга**, который показывается сразу после завершения welcome-онбординга. Задача — провести юзера по ключевым фичам с подсветкой элементов, объяснениями и медиа.

> **Критичность:** если онбординг сломается, юзер не сможет пользоваться приложением. Поэтому при любой ошибке тур закрывается, **но `appTour` НЕ помечается завершённым** — при следующем входе попытка повторится.

## Поведение

- Запуск автоматический, сразу после welcome-онбординга, при первом входе.
- Юзер может нажать **«Пропустить»** в bubble. Это вызывает `complete()` и помечает `appTour = true`, чтобы тур не запускался повторно.
- Юзеру **доступны только кнопки «Пропустить» / «Назад» / «Далее»** в bubble. Все остальные UI-элементы заблокированы overlay'ем.
- Тур ведёт юзера по разным страницам (роутинг работает в обычном режиме — URL меняется, layout перезагружается).
- При переходе со страницы на страницу — анимация «тапа» по элементу, который был в фокусе.
- На последнем шаге кнопка «Далее» становится «Начать», по нажатию вызывается endpoint и `appTour = true`.
- В случае ошибки — тур закрывается без пометки завершения, юзер получает доступ к приложению.

## Библиотека

**[driver.js](https://driverjs.com/) v2.x** — для spotlight/highlight-эффекта и overlay-блокировки. Лёгкая (≈12kb gzip), MIT, идеально работает с Vue 3, не требует адаптера. Шаги, роутинг, медиа в bubble и tap-анимации — кастомная имплементация поверх driver.js.

## База данных

Поле `onboarding` в таблице `users` хранится как JSONB и расширяется без миграции:

```ts
// Было
onboarding: { welcome: true }

// Стало
onboarding: { welcome: true, appTour: true }
```

Дефолт для существующих юзеров: `appTour` отсутствует ⇒ интерпретируется как `false`.

## Backend

### `shared/dto/user.ts`

Расширить `UserMeDto.user.onboarding`:

```ts
onboarding: z.object({
  welcome: z.boolean(),
  appTour: z.boolean().optional(),
}).optional()
```

### `server/api/user/me.get.ts`

В формировании response пробросить `appTour`:

```ts
onboarding: {
  welcome: Boolean(onboarding?.welcome),
  appTour: Boolean(onboarding?.appTour),
}
```

### Новый endpoint `POST /api/user/onboarding/app-tour/complete`

- Требует авторизации (`getSessionUser`).
- Безусловно ставит `users.onboarding.appTour = true` через JSONB merge.
- Возвращает `{ ok: true }`.
- Тело запроса — пустой объект.

## Frontend

### Структура файлов

```
app/
├── composables/
│   └── useAppTour.ts                 # Главный composable: стейт, шаги, роутинг, ошибки
├── lib/
│   └── appTourSteps.ts               # Конфигурация всех шагов тура
└── components/
    └── app-tour/
        ├── AppTourOverlay.vue        # Глобальный overlay (driver.js spotlight)
        ├── AppTourBubble.vue         # Попап с медиа и кнопками
        └── AppTourTapRipple.vue      # Анимация tap-ripple
```

Подключение в `app.vue`:

```vue
<ClientOnly>
  <AppTourOverlay />
</ClientOnly>
```

### Тип шага

```ts
export interface AppTourStep {
  id: string;                        // 'home-hero', 'chat-mic', ...
  page: string;                      // '/' | '/chat' | '/therapy' | ...
  targetSelector: string | null;     // '[data-tour="chat-mic"]' | null (центрированный bubble)
  bubble: {
    title: string;
    description: string;
    media?: {
      type: 'image' | 'gif' | 'video' | 'lottie';
      src: string;
      alt?: string;
    };
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  };
  highlightPadding?: number;         // отступ spotlight, default 8
  tapBeforeNext?: boolean;           // воспроизвести tap-анимацию перед переходом
  navigateTo?: string;               // путь для перехода после tap-анимации
  awaitSelector?: string;            // ждать появления селектора после navigateTo
  /**
   * Skip-функция: шаг пропускается, если возвращает true.
   * Получает контекст с инфой о доступности фич (триал, тариф).
   * Используется, чтобы скрыть шаги, которые юзер всё равно не сможет
   * использовать (например, шаги про чат при истёкшем триале).
   */
  skipIf?: (ctx: AppTourSkipContext) => boolean;
}

export interface AppTourSkipContext {
  hasChatAccess: boolean;            // chat.assistant.available
  hasRealtimeVoiceAccess: boolean;   // chat.realtime_voice.available
}
```

### Логика продвижения по шагам (next/prev)

`useAppTour` собирает `skipContext` из `useEntitlements` и в момент каждого `next()` / `prev()` ищет ближайший НЕ-скипнутый шаг (`findNextEligibleIndex` / `findPrevEligibleIndex`).

**Кейс «истёкший триал»:** у юзера нет доступа к чату → шаги `home-hero`, `chat-mic`, `chat-realtime-voice`, `chat-summary` помечены `skipIf: (ctx) => !ctx.hasChatAccess` → автоматически пропускаются. Тур остаётся в актуальном daily loop на главной и дальше переходит к терапии без ложного тапа по ассистенту.

**Защита от тупиков:** даже если skipIf не покрыл какой-то edge-case (DOM не поднялся, navigateTo упал, элемент не отрендерился) — `advanceToNext()` пробует следующий шаг до `MAX_FAILED_ATTEMPTS = 5`. Если все попытки исчерпаны, тур закрывается через `complete()`, **который помечает `appTour = true`**, чтобы юзер не застревал в этой петле повторно при каждом входе. Это критическое отличие от `forceClose()`: при неожиданной ошибке мы предпочитаем «потерять» тур, чем оставить юзера в неработающем состоянии.

### Прогресс и кнопки «Пропустить / Назад / Далее»

- `totalSteps`, `progress`, `isFirstStep`, `isLastStep` — все вычисляются среди **видимых** шагов (с учётом `skipIf`). Юзер не увидит `«5 из 15»`, если для него реально доступно только 11 шагов.
- Кнопка «Назад» скрыта, если перед текущим шагом нет ни одного видимого шага (даже если `currentIndex > 0`).

### Стейт `useAppTour`

```ts
const isActive = ref(false);
const currentIndex = ref(0);
const isTransitioning = ref(false);   // блокировка кнопок во время tap+navigate
const isCompleting = ref(false);
const failed = ref(false);
```

### Логика запуска

Тур запускается **только если все условия выполняются одновременно**:

1. `auth.user` авторизован.
2. `user.onboarding.welcome === true` (welcome-визард пройден).
3. `user.onboarding.appTour !== true` (тур ещё не пройден).
4. `appLock.canShowPrivateContent === true` — юзер реально видит приложение, а не экран ввода пин-кода / биометрии / privacy overlay (когда юзер вернулся в приложение из фона).
5. `route.path` не из `PUBLIC_ROUTE_PREFIXES` (`/auth`, `/onboarding`, `/error`, `/forgot`, `/reset-password`, `/payment-success`).

Все условия объединены в reactive computed `canStart` внутри `useAppTour`. `AppTourOverlay.vue` подписывается на него:

```ts
watch(
  () => tour.canStart.value,
  (canStart) => {
    if (canStart && !tour.isActive.value) {
      // отложенный старт через 600ms, затем start() ждёт первый target
      pendingStartTimeout = setTimeout(() => void tour.start(), 600);
    } else if (!canStart && tour.isActive.value) {
      // Юзер свернул приложение / попал на /auth / включился AppLock —
      // закрываем тур без пометки appTour=true.
      tour.forceClose();
    }
  },
  { immediate: true }
);
```

**Поведение в типичных сценариях:**

| Сценарий | Что происходит |
|---|---|
| Юзер впервые завершил welcome-онбординг | `canStart` становится `true` → через 600ms запускается тур |
| Юзер свернул приложение во время тура (Capacitor) | AppLock показывает privacy overlay → `canShowPrivateContent` становится `false` → тур закрывается |
| Юзер вернулся в приложение, ввёл пин | AppLock убирает overlay → `canShowPrivateContent` снова `true` → тур запускается заново с первого шага |
| Юзер на странице `/auth` (например, перезагрузил браузер с истекшей сессией) | `canStart === false` → тур не запускается даже если localStorage хранит auth.user |

### Обработка ошибок

```ts
async function next() {
  if (isTransitioning.value) return;
  try {
    await runStep(currentIndex.value + 1);
    currentIndex.value++;
  } catch (e) {
    console.error('[AppTour] step failed:', e);
    forceClose();   // НЕ помечаем appTour = true
  }
}

function forceClose() {
  isActive.value = false;
  driver?.destroy();
  document.body.style.overflow = '';
  // appTour остаётся false → следующий вход покажет тур снова
}
```

### Блокировка UI

driver.js создаёт полупрозрачный overlay поверх всего экрана, кроме spotlight-области. На время тура корневой `<body>` получает класс `app-tour-active`, а интерактивные элементы внутри подсвеченного контейнера — атрибут `data-tour-lock`, который через CSS отключает у них клики:

```css
body.app-tour-active [data-tour-lock] {
  pointer-events: none !important;
}
```

Кнопки «Пропустить / Назад / Далее» в bubble — единственное, что доступно для нажатия.

### Tap-анимация

`AppTourTapRipple.vue` рендерится через `<Teleport to="body">`:

1. Получает координаты центра target-элемента.
2. Воспроизводит CSS-анимацию: расширяющийся круг + лёгкое масштабирование самого элемента (через CSS-переменную, на 600ms).
3. По окончанию анимации — `await navigateTo(step.navigateTo)`.
4. После роутинга ждёт появления `step.awaitSelector` (с MutationObserver или `setInterval` с timeout 5s).
5. Запускает driver.js на новом шаге.

### Адаптивность

- На десктопе bubble позиционируется через стандартный driver.js (top/bottom/left/right относительно target).
- На мобиле (< 640px) bubble всегда фиксируется снизу (или сверху, если target в нижней части экрана), занимая всю ширину минус safe-area paddings.
- Медиа в bubble имеет `aspect-ratio: 16/9` и максимальную высоту 200px на мобиле, 280px на десктопе.
- Прогресс-индикатор (точки) — горизонтальный скролл если шагов > 12.

## Шаги тура

> Контент (тексты, медиа) описан в `app/lib/appTourSteps.ts`. Медиа-файлы добавляются отдельно в `public/onboarding/tour/` (юзер занимается этим самостоятельно).

### Шаг 1 — Главная (`/`) — карта пути

- **Target:** `[data-tour="home-roadmap"]` (активная карточка программы / roadmap).
- **Bubble:**
  - Заголовок: «Карта пути»
  - Текст: «Здесь твой основной daily loop: текущий шаг программы, прогресс и понятное действие на сегодня. Например, блок „Где тревога живёт в теле“ ведёт по карте маленькими шагами.»

### Шаг 2 — Главная — Оранжерея

- **Target:** `[data-tour="home-garden"]` (карточка ростка / Оранжерея).
- **Bubble:**
  - Заголовок: «Оранжерея»
  - Текст: «За пройденные шаги росток получает капли и растёт вместе с твоим прогрессом. В Оранжерее можно увидеть путь и выбрать следующую программу.»

### Шаг 3 — Главная — карточка ИИ-помощника

- **Target:** `[data-tour="home-hero"]` (компактная карточка ИИ-ассистента).
- **Bubble:**
  - Заголовок: «ИИ-помощник»
  - Текст: «Это твой личный ИИ-психолог. Расскажи, что беспокоит — он выслушает, задаст нужные вопросы и предложит конкретные шаги. Доступен 24/7.»
- **На «Далее»:** анимация тапа на кнопку «Начать» → `navigateTo('/chat')`.

### Шаг 4 — Чат (`/chat`) — микрофон

- **Target:** `[data-tour="chat-mic"]` (кнопка микрофона).
- **Bubble:**
  - Заголовок: «Запись голоса»
  - Текст: «Нажми и говори вместо того, чтобы печатать. Твой голос превратится в текст и отправится как обычное сообщение.»

### Шаг 5 — Чат — голосовой режим (трубка)

- **Target:** `[data-tour="chat-realtime-voice"]` (кнопка с трубкой).
- **Bubble:**
  - Заголовок: «Разговор вживую»
  - Текст: «Режим живого общения голосом. Говоришь — ИИ-помощник тут же отвечает голосом, как настоящий разговор. Никакого печатания.»

### Шаг 6 — Чат — кнопка «Подвести итог»

- **Target:** `[data-tour="chat-summary"]` (кнопка «Подвести итог»).
- **Bubble:**
  - Заголовок: «Итог сессии»
  - Текст: «После разговора нажми эту кнопку — ИИ-помощник структурирует всё, что вы обсудили: о чём говорили, что было важным, какие шаги сделать дальше.»
- **На «Далее»:** анимация тапа → `navigateTo('/therapy')`.

### Шаг 7 — Терапия (`/therapy`) — карточка темы

- **Target:** `[data-tour="therapy-card"]` (вся карточка первой темы).
- **Bubble:**
  - Заголовок: «Темы поддержки»
  - Текст: «В терапии собраны темы, с которыми можно работать отдельно: тревога, стресс, самооценка, отношения и другие состояния.»
- **На «Далее»:** анимация тапа по карточке темы → `navigateTo('/therapy/anxiety')`.

### Шаг 8 — Тема (`/therapy/[key]`) — блок напоминаний

- **Target:** `[data-tour="therapy-reminders-card"]` (вся карточка `NotificationsSummaryCard`).
- **Bubble:**
  - Заголовок: «Почему напоминания работают»
  - Текст: «Регулярные напоминания — это сильнейший инструмент. Они помогают не забывать про практики, формируют привычку и поддерживают тебя в моменты, когда ты этого не ждёшь. Без напоминаний прогресс замедляется в разы.»

### Шаг 9 — Тема — тумблер напоминаний

- **Target:** `[data-tour="therapy-reminders-toggle"]` (Switch).
- **Bubble:**
  - Заголовок: «Включить напоминания»
  - Текст: «Включи — и приложение будет регулярно напоминать практиковаться. Частоту, время и дни — всё можно настроить.»

### Шаг 10 — Настройки напоминаний — общий обзор

- **Target:** null (центрированный bubble).
- **Bubble:**
  - Заголовок: «Настройки напоминаний»
  - Текст: «Выбери частоту, временной диапазон и активные дни. Приложение распределит напоминания так, чтобы они помогали, а не раздражали.»

### Шаг 11 — Завершение

- **Target:** null (центрированный bubble на той же странице, либо на главной).
- **Bubble:**
  - Заголовок: «Готово!»
  - Текст: «Теперь ты знаешь, где что искать. Удачи!»
  - Кнопка «Далее» меняется на «Начать».
- **На «Начать»:**
  1. `POST /api/user/onboarding/app-tour/complete`
  2. Локально обновить `auth.user.onboarding.appTour = true`.
  3. `navigateTo('/')`.
  4. Закрыть overlay.

## Data-tour атрибуты — таблица соответствия

| Селектор | Файл | Элемент |
|---|---|---|
| `data-tour="home-roadmap"` | `app/components/home/HomeRoadmapCard.vue` | Карточка активной карты пути |
| `data-tour="home-garden"` | `app/components/home/HomeEnergyPlantCard.vue` | Карточка ростка / Оранжереи |
| `data-tour="home-hero"` | `app/components/home/HomeAssistantCompact.vue` | Компактная карточка ИИ-ассистента |
| `data-tour="chat-mic"` | `app/pages/chat.vue` | Кнопка микрофона |
| `data-tour="chat-realtime-voice"` | `app/pages/chat.vue` | Кнопка с трубкой |
| `data-tour="chat-summary"` | `app/pages/chat.vue` | Кнопка «Подвести итог» |
| `data-tour="therapy-card"` | `app/components/notifications/NotificationIndexPage.vue` | Карточка темы (первая) |
| `data-tour="therapy-reminders-card"` | `app/components/notifications/NotificationsSummaryCard.vue` | Корневой div |
| `data-tour="therapy-reminders-toggle"` | `app/components/notifications/NotificationsSummaryCard.vue` | `<Switch />` |

> Атрибуты ставятся в шаблонах и **не влияют** ни на DOM, ни на стили, ни на CSS-класс.

## Тестирование (чек-лист)

- [ ] Тур запускается автоматически после welcome-онбординга.
- [ ] Тур не запускается, если `appTour = true`.
- [ ] Кнопки UI заблокированы во время тура (нельзя нажать на «Начать» в чате через spotlight).
- [ ] Прев/некст работают, индекс шага не выходит за границы.
- [ ] Tap-анимация воспроизводится перед навигацией.
- [ ] После навигации тур ждёт появления selector'а и продолжает с правильного шага.
- [ ] Если selector не появился за 5s — тур закрывается без пометки завершения.
- [ ] При перезагрузке страницы посередине тура — тур начинается заново с первого шага.
- [ ] На мобиле (< 375px) bubble не выходит за края экрана, медиа адаптивно.
- [ ] Endpoint `POST /api/user/onboarding/app-tour/complete` ставит флаг и юзер не видит тур повторно.
- [ ] Если endpoint вернул ошибку — тур закрывается, но `appTour` остаётся `false`.
- [ ] iOS / Android Capacitor: spotlight корректно учитывает safe-area.

## Повторный запуск из настроек (replay)

В настройках (`/settings`, секция «ОБУЧЕНИЕ») есть кнопка «Пройти обзор интерфейса заново». По нажатию:

1. `await navigateTo('/')` — переход на главную, где первый шаг тура.
2. `useAppTour().startReplay()` — стартует тур, минуя проверку `appTour === true`.

В replay-режиме (`isReplay = true`):

- **Бэкенд не дёргается** ни на старте, ни в `complete()` — флаг `onboarding.appTour` уже стоит, повторный POST бесполезен.
- Чтобы тур корректно закрывался при срабатывании AppLock / уходе на `/auth` посреди прохождения (в этом режиме `canStart` всегда `false`, основной watcher не сработает), в `useAppTour` есть отдельный computed `canRemainOpen`, на который подписан второй watcher в `AppTourOverlay.vue` — он зовёт `forceClose()` при потере условий.
- `forceClose()` сбрасывает `isReplay` обратно в `false`.

## Что НЕ входит в эту задачу

- Локализация на EN.
- A/B-тестирование контента шагов.
- Метрика прохождения шагов (отдельный тикет, можно добавить через analytics-store).

## Обратная совместимость

- Поле `appTour` опционально в DTO — старые клиенты не упадут.
- Endpoint новый, старые клиенты его не вызывают.
- Если БД вернёт `appTour: undefined` для старого юзера — клиент интерпретирует как `false` и покажет тур.
