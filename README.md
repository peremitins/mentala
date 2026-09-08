![AI chat](screenshots/screenshots-1.png)
![Voice session](screenshots/screenshots-2.png)

# Mentala

Mentala: AI-продукт для поддержки психического здоровья. В репозитории находятся веб-приложение и мобильные приложения для iOS и Android, API, AI-функции в реальном времени, подписки и уведомления.

Сайт: [mentala.app](https://mentala.app)

## Стек

- Vue 3, Nuxt 4, TypeScript, Pinia
- Nitro, PostgreSQL, Drizzle ORM, Redis, BullMQ, Zod
- Tailwind CSS, shadcn-vue, Vitest
- Capacitor, App Store, Google Play

## Архитектура

- [Описание продукта](.docs/PROJECT_DESCRIPTION.md)
- [Общая архитектура](.docs/architecture.md)
- [Память AI-чата](.docs/arch_chat_memory.md)
- [Подписки](.docs/arch_billing.md)
- [Уведомления](.docs/arch_notifications.md)
- [Безопасность](.docs/security_requirements.md)

## Локальный запуск

Для полноценного запуска потребуются Node.js 20+, pnpm, PostgreSQL и Redis. Серверная часть и API находятся в этом репозитории. Для локальной работы интеграций создайте `.env` на основе `.env.example` и укажите свои тестовые значения.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Проверки качества

```bash
pnpm lint
pnpm test
pnpm build
```
