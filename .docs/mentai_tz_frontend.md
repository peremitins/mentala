# Mentala — Frontend ТЗ

## Стек
Nuxt 4, TypeScript, Pinia, Tailwind CSS, Radix Vue / shadcn-vue, unplugin-icons (Lucide), vue-i18n, @tanstack/vue-query (+ ofetch), @vueuse/core, Capacitor, Vitest, Sentry

## Структура (Nuxt 4)
```
app/
├─ components/     # shadcn + кастомные
├─ composables/    # use* (запросы, helpers)
├─ layouts/        # default, blank, auth
├─ middleware/     # auth, i18n-redirect
├─ pages/          # маршруты
├─ plugins/        # i18n, vue-query, sentry, api
├─ stores/         # Pinia
└─ utils/
shared/dto/        # Zod-схемы (общие с бэком)
```

## UI правила
- Glassmorphism: backdrop-blur, bg-white/10, мягкие тени, радиусы 16-24px
- Цвета — только CSS-переменные из tailwind.css, `dark:` классы запрещены
- Компоненты: shadcn-vue как база
- Иконки: Lucide (основные), Tabler/Phosphor через Iconify

## Данные и запросы
- HTTP только через vue-query (`useQuery`/`useMutation`) с `useAPI()` (`$api`)
- Состояние: Pinia для глобального, composables для локального
- DTO (Zod): `shared/dto/*`, ответ парсится через Zod

## Кроссплатформенность
- Web: Chrome, Firefox, Safari, Edge (последние версии)
- iOS 15+, Android 8+
- Проверка API через `typeof` или `isDocumentAvailable()`
- Capacitor plugins для нативных функций, VueUse для кросс-браузерных
- Async/await везде, не .then()/.catch()

## Качество
- LCP < 2.5s, TTI < 3s
- ESLint + Prettier, Husky + lint-staged
- Vitest для критичных путей
- TS no-any, Zod-валидация форм (vee-validate)
