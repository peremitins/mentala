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

## Redis

Локальная разработка:

- локальный Redis может работать без пароля, если он слушает только `127.0.0.1`;
- для этого проекта локальный Docker Redis поднимается именно в таком режиме.

Production:

- `REDIS_PASSWORD` обязателен;
- `REDIS_HOST` должен указывать на Redis внутри docker compose сети, обычно `redis`;
- `REDIS_PORT` по умолчанию `6379`.

Пример server-side env для `/opt/mentala/prod/.env`:

```bash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=replace_me
```

Пример `redis` сервиса в `/opt/mentala/prod/docker-compose.yml`:

```yaml
  redis:
    image: redis:7-alpine
    container_name: mentala-redis-prod
    command:
      - sh
      - -c
      - redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "REDISCLI_AUTH=$REDIS_PASSWORD redis-cli ping"]
      interval: 5s
      timeout: 3s
      retries: 20
```

`web` контейнер должен читать тот же `REDIS_PASSWORD` через свой `env_file: .env`.

## Шаблоны уведомлений

После правок в `app/lib/notificationTemplates.ts` нужно синхронизировать шаблоны в БД:

```bash
# Dev
pnpm db:sync-notification-templates

# Prod
pnpm db:sync-notification-templates -- --env=production
```

Скрипт очищает таблицы `notification_texts` и `notification_text_presets` и заполняет их заново из TS-файла.
