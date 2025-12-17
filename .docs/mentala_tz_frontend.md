# Mentala — Техническое задание (Frontend)

## 1. Цель

Реализовать фронтенд (Web/PWA + контейнеры iOS/Android через Capacitor) с современным UI (glassmorphism), локализацией RU/EN, безопасным чатом с ИИ и трекерами.

## 2. Стек (зафиксирован)

- **Nuxt 4**, **TypeScript**, **Pinia**
- **Tailwind CSS**, **Radix Vue**, **shadcn‑vue**
- **unplugin-icons** + **Lucide** (разрешены также Tabler/Phosphor через Iconify)
- **vue‑i18n**
- **@tanstack/vue-query** (+ ofetch)
- **Sentry**
- **Vitest**
- **ESLint + Prettier** (+ prettier-plugin-tailwindcss)
- **Capacitor**, **Ionic Vue** (точечно при необходимости)
- **@vueuse/core**
- **vue-chartjs (Chart.js)**
- **zod + @vee-validate/zod**
- **Storybook**
- **Husky + lint-staged**
- **commitlint + cz-git**

## 3. Структура проекта (Nuxt v4)

```
mentala/frontend/
├─ app/
│  ├─ app.vue
│  ├─ components/            # атомы/молекулы/организмы (поверх shadcn)
│  ├─ composables/           # use* (запросы, helpers, vueuse)
│  ├─ layouts/               # default, blank, auth
│  ├─ middleware/            # auth, i18n-redirect
│  ├─ pages/                 # маршруты
│  │  ├─ index.vue           # главный экран (аватар + чат)
│  │  ├─ onboarding.vue
│  │  ├─ chat.vue
│  │  ├─ therapy.vue
│  │  ├─ habits.vue
│  │  ├─ sos.vue
│  │  ├─ profile/
│  │  │  ├─ index.vue
│  │  │  ├─ export.vue
│  │  │  └─ delete.vue
│  │  └─ billing.vue
│  ├─ plugins/              # автоподключение по правилам Nuxt
│  │  ├─ i18n.ts
│  │  ├─ vue-query.client.ts
│  │  ├─ sentry.client.ts
│  │  ├─ icons.client.ts
│  │  └─ radix-shadcn.ts
│  └─ utils/
├─ public/                  # статические файлы (иконки, manifest, robots)
├─ capacitor/               # iOS/Android контейнеры
├─ tests/
│  ├─ unit/                 # Vitest
│  └─ e2e/                  # Playwright (этап 2)
├─ server/                  # Nitro (см. backend ТЗ)
└─ shared/
   ├─ dto/                  # Zod схемы (общие с бэком)
   ├─ utils/
   └─ constants/
```

## 4. UI/Дизайн‑гайды

- **Glassmorphism**: `backdrop-blur-md`, `bg-white/10`, `border-white/15`, градиенты, тени мягкие, радиусы 16–24px.
- Контраст и a11y: проверка WCAG AA (темная тема по умолчанию).
- Иконки: через `unplugin-icons`; базовые — **Lucide**, можно добавлять Tabler/Phosphor.
- Компоненты: shadcn‑vue как база (кнопки, инпуты, диалоги, toasts).

## 5. Навигация/Экраны (MVP)

- Главная (аватар + чат), нижняя панель действий, кнопка “fullscreen” для скрытия UI.
- Онбординг (анкета + цели + согласия).
- Трекер привычек (лист + логирование + графики).
- Задания дня (чек‑лист).
- SOS (шаги/контакты/горячие линии).
- Профиль/настройки (язык, приватность, экспорт/удаление данных).
- Биллинг (продукты, покупка web, показ статуса подписки).

## 6. Данные/запросы

- `vue-query`: кэш, refetch, ошибки (toasts + Sentry).
- Общие **DTO (zod)** в `shared/dto/*` — импорт в запросах и проверка ответов.
- Ошибки API приводим к общему формату `{ error: { code, message } }`.

## 7. Формы

- **vee-validate + zod**: схема → валидация → сообщения i18n.
- Должна быть клавиатурная доступность, автофокус, ошибки под полями.

## 8. Мультимедиа

- Чат: текст + опция TTS (Howler на фронте для проигрывания), STT (иконка микрофона).
- 3D‑аватар (этап 1): триггер анимаций (мигание/кивок), затем синхронизация губ (этап 2).

## 9. PWA/Мобильное

- PWA: manifest, icons, offline‑cache (этап 2).
- Capacitor: доступ к пушам/хаптике/файлам/предпочтениям.
- Ionic Vue: точечное использование (например, ion‑tabs), если ускоряет UX.

## 10. Кроссплатформенность и совместимость

### 10.1. Поддерживаемые платформы

Весь код должен работать на всех устройствах и браузерах, включая:

- **Web**: современные браузеры (Chrome, Firefox, Safari, Edge) последних версий
- **iOS**: iOS 13+ (iPhone и iPad)
- **Android**: Android 8.0+ (API level 26+)

### 10.2. Требования к коду

- **Универсальность API**: избегать использования платформо-специфичных API без проверки доступности
- **Проверка доступности**: перед использованием браузерных API (например, `navigator.clipboard`, `window.addEventListener`, `document.body`) необходимо проверять их наличие через `typeof` или `isDocumentAvailable()`
- **Capacitor-обёртки**: для нативных функций использовать Capacitor plugins (`@capacitor/clipboard`, `@capacitor/preferences`, `@capacitor/push-notifications` и т.д.)
- **VueUse composables**: предпочтительно использовать `@vueuse/core` для кросс-браузерных решений (`useClipboard`, `useResizeObserver`, `useElementSize` и т.д.)
- **Fallback-механизмы**: для критичных функций предусматривать fallback на альтернативные методы (например, `document.execCommand('copy')` как fallback для Clipboard API)

### 10.3. Асинхронные операции

Для всех асинхронных операций использовать **async/await** вместо цепочек `.then()/.catch()`:

- **Запросы к API**: все HTTP-запросы через `async/await`
- **Работа с Capacitor**: все вызовы нативных плагинов через `async/await`
- **Обработка ошибок**: использовать `try/catch` блоки для обработки ошибок
- **Параллельные запросы**: использовать `Promise.all()` или `Promise.allSettled()` для параллельных операций
- **Composables**: все composables, выполняющие асинхронные операции, должны возвращать Promise и использовать `async/await` внутри

**Примеры:**

```typescript
// ✅ Правильно
async function fetchData() {
  try {
    const response = await $api.get('/endpoint');
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// ❌ Неправильно
function fetchData() {
  return $api
    .get('/endpoint')
    .then((response) => response.data)
    .catch((error) => {
      console.error('Error:', error);
      throw error;
    });
}
```

### 10.4. Тестирование на платформах

- **Web**: тестирование в основных браузерах (Chrome, Firefox, Safari, Edge)
- **iOS**: тестирование на реальных устройствах и симуляторах
- **Android**: тестирование на реальных устройствах и эмуляторах
- **Responsive**: проверка адаптивности на различных размерах экранов

## 11. Качество / CI/CD

- ESLint + Prettier + prettier‑plugin‑tailwindcss.
- Husky + lint-staged (на `pre-commit`).
- Vitest (юниты), Playwright (этап 2).
- Sentry для ошибок (client + server).
- Storybook — каталог UI, визуальные регресс‑снапшоты (этап 2).

## 12. Performance

- Бюджеты: LCP < 2.5s, TTI < 3s на mid‑девайсах.
- Code‑splitting страниц/компонентов; lazy‑загрузка 3D и TTS.
- Оптимизация изображений (nuxt/image или внешняя CDN).

## 13. Definition of Done (MVP)

- Соответствие UX‑гайдам (glass + a11y).
- Покрытие типов (TS no‑any).
- Валидация форм (zod).
- Локализация RU/EN (i18n‑ключи).
- Ошибки и клики логируются в Sentry.
- Тесты: критичный happy‑path покрыт Vitest.
