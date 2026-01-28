# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Миграции БД

Локальная разработка (dev):

```bash
pnpm db:migrate -- --env=development
```

Локальный запуск prod-миграций (только осознанно):

```bash
MIGRATE_PROD_CONFIRM=YES pnpm db:migrate -- --env=production
```

Базовый baseline (один раз, только при первичном заведении Drizzle на prod):

```bash
MIGRATE_PROD_CONFIRM=YES pnpm db:baseline -- --env=production
```

Важно:

- Для dev используется `.env.development`, для local prod — `.env.production`, на сервере prod — `.env`.
- В env-файле должен быть указан `MENTALA_DB_ENV=development|production`.
- Для контейнеров миграций на проде нужен доступ к `.env` (например, через `DRIZZLE_ENV_FILE=/app/.env` и volume).
