![AI chat](screenshots/Device%2014PM-1.png)
![Voice session](screenshots/Device%2014PM-6.png)

# Mentala

Mentala is an AI-powered mental health product for web, iOS, and Android. The project includes a Vue and Nuxt application, backend API routes, real-time AI interactions, subscriptions, notifications, and mobile delivery through Capacitor.

Live product: [mentala.app](https://mentala.app)

## My role

I created and developed Mentala as an independent product from architecture to production release. My work includes frontend architecture, Vue 3 and Nuxt implementation, mobile delivery, API integration, subscriptions, push notifications, and application publishing for iOS and Android.

## Stack

- Vue 3, Nuxt 4, TypeScript, Pinia
- Nitro, PostgreSQL, Drizzle ORM, Redis, BullMQ, Zod
- Tailwind CSS, shadcn-vue, Vitest
- Capacitor, App Store, Google Play

## Architecture notes

- [Product overview](.docs/PROJECT_DESCRIPTION.md)
- [Architecture](.docs/architecture.md)
- [AI chat memory](.docs/arch_chat_memory.md)
- [Billing](.docs/arch_billing.md)
- [Notifications](.docs/arch_notifications.md)
- [Security](.docs/security_requirements.md)

## Public source policy

This repository contains the application source code and its cleaned development history. Production credentials, deployment configuration, mobile signing files, provider settings, internal prompts, and operational documentation are intentionally excluded.

The repository is published for review. No license is granted for copying, redistribution, or commercial use of the code.

## Local setup

Requirements: Node.js 20+, pnpm, PostgreSQL, and Redis for server-side functionality.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The full application requires your own local service configuration and credentials for optional integrations. Do not use production credentials in local environment files.

## Quality checks

```bash
pnpm lint
pnpm test
pnpm build
```

## AI relay

The optional AI relay has its own environment template:

```bash
cp apps/ai-relay/.env.example apps/ai-relay/.env
```

Supply your own provider key and relay secret locally. They are not included in this repository.
