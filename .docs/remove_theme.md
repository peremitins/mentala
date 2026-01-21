## План

- Пройтись по фронту и убрать переключение темы + любые `.dark`/`light` ветки, оставив тёмные значения как базовые.
- Удалить модуль color-mode и всё, что хранит/отдаёт тему (UI, store, API, БД).
- Обновить PWA/иконки, где есть реакция на тему.
- Сверить, что тёмная палитра стала дефолтом и ничего не зависит от класса `dark`.

## Где нужно удалить логику темы

Frontend:

- `nuxt.config.ts` — модуль `@nuxtjs/color-mode` и блок `colorMode` (system/light fallback).
- `tailwind.config.js` — `darkMode: ['class']` и `safelist: ['dark']`.
- `app/components/HeaderSettingsMenu.vue` — UI выбора темы (Combobox + `useColorMode`).
- `app/constants/select-options.ts` — `THEME_OPTIONS` (system/dark/light).
- `app/components/ui/bg-neural/NeuralBg.vue` — зависимость от `useColorMode`, логика светлой/тёмной палитры.
- `app/assets/css/tailwind.css` — разделы `:root` (светлая), `.dark` (тёмная), `color-scheme: light dark`, `.dark` правила скроллбара.
- `app/assets/css/main.scss` — `.glass-deep`, `.bubble`, `.icon-disc` и `.icon-disc-wrapper` с ветками `.dark`.
- `public/site.webmanifest` — `theme_color` и `background_color` сейчас белые.
- `public/favicon.svg` — есть `@media (prefers-color-scheme: dark)`.

Backend/БД:

- `server/infrastructure/db/schema.ts` — колонка `chat_settings.theme`.
- `server/utils/storage.ts` — тип/дефолты/чтение/запись `theme`.
- `server/api/settings/chat.patch.ts` — `theme` в payload.
- `server/api/settings/chat.get.ts` — отдаёт настройки с `theme`.
- `app/stores/chatSettings.ts` — поле `theme` в состоянии.

## ТЗ (удаление настроек светлой/тёмной темы)

### 1) Цель

Полностью убрать поддержку светлой/тёмной темы и переключение. По умолчанию остаётся **тёмная палитра**, т.е. все переменные и стили берём из текущей `.dark`.

### 2) Область работ

- Frontend (UI, стили, конфиги)
- Backend (API/Storage)
- База данных (schema + миграция)
- PWA-артефакты (manifest, favicon)

### 3) Требования (конкретно)

**Frontend**

- Удалить `@nuxtjs/color-mode` из `nuxt.config.ts` и зависимостей `package.json`.
- Удалить селектор темы из `HeaderSettingsMenu.vue`, а также `useColorMode`.
- Удалить `THEME_OPTIONS` и любые ссылки на системную/светлую/тёмную тему.
- Оставить `Toaster theme="dark"` как фиксированный стиль (не удалять).
- В `NeuralBg.vue` убрать зависимость от темы:  
  оставить фиксированную «тёмную» палитру по умолчанию (или только пропсы без ветвления).
- В `tailwind.config.js` убрать `darkMode` и `safelist: ['dark']`.
- В `app/assets/css/tailwind.css`:
  - Перенести **значения из `.dark`** в `:root` как базовые.
  - Полностью удалить блок `.dark`.
  - `color-scheme` выставить только `dark`.
  - Скроллбар — оставить вариант под тёмную тему как единственный.
- В `app/assets/css/main.scss`:
  - Удалить `.dark` селекторы.
  - Базовые стили `.glass-deep`, `.bubble`, `.icon-disc`, `.icon-disc-wrapper` сделать тёмными (из текущих `.dark` правил).
- В `public/site.webmanifest` выставить `theme_color` и `background_color` под тёмный фон: `#09090b` (эквивалент `hsl(240 10% 3.9%)`).
- В `public/favicon.svg` убрать зависимость от `prefers-color-scheme` (оставить один вариант).

**Backend / Storage**

- Удалить `theme` из `ChatSettings` в `server/utils/storage.ts` и логики read/write.
- Удалить `theme` из payload и ответа `server/api/settings/chat.patch.ts` / `chat.get.ts`.
- Удалить `theme` из `app/stores/chatSettings.ts`.

**База данных**

- В `server/infrastructure/db/schema.ts` удалить колонку `chat_settings.theme`.
- Сгенерировать миграцию через `pnpm db:generate` и применить `pnpm db:migrate`.
- Никаких ручных правок файлов миграций.

**Документация**

- Обновить `/.docs/architecture.md`, зафиксировать отказ от multi-theme и работу только в тёмной палитре.

### 4) Acceptance Criteria

- В UI нет выбора темы, нет упоминаний light/dark/system.
- В коде нет `useColorMode`, `@nuxtjs/color-mode`, `dark` класса и `.dark` CSS.
- Тёмные переменные используются как базовые по умолчанию.
- Бэкенд и фронт не хранят и не отдают `theme` в настройках.
- `chat_settings` в БД без колонки `theme`.
- PWA manifest и favicon не зависят от темы.
- `theme_color` и `background_color` в `site.webmanifest` — `#09090b`.
- Линтеры/сборка проходят.

### 5) Примечания

- Тёмная тема считается «единственным режимом», поэтому никаких fallback’ов под светлую не требуется.
