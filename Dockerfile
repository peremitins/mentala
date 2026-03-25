# --- СТАДИЯ СБОРКИ ---
FROM node:20-alpine AS build

# Включаем corepack и надёжно активируем pnpm (с ретраями на сетевые флейки)
ENV PNPM_VERSION=10.33.0
RUN corepack enable \
  && for i in 1 2 3 4 5; do \
    corepack prepare "pnpm@${PNPM_VERSION}" --activate && break; \
    echo "⚠️  corepack prepare pnpm failed (attempt ${i}/5), retrying..." >&2; \
    sleep $((i * 2)); \
  done

WORKDIR /app

# Копируем файлы для установки зависимостей
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Устанавливаем зависимости строго по pnpm-lock
RUN pnpm config set fetch-retries 5 \
  && pnpm config set fetch-retry-factor 2 \
  && pnpm config set fetch-retry-mintimeout 10000 \
  && pnpm config set fetch-retry-maxtimeout 60000 \
  && pnpm config set fetch-timeout 600000 \
  && pnpm install --frozen-lockfile

# Копируем весь проект
COPY . .

# Сборка Nuxt (Nitro складывает сервер в .output)
RUN pnpm build

# --- СТАДИЯ МИГРАЦИЙ ---
FROM build AS migrate
WORKDIR /app

# --- СТАДИЯ РАНТАЙМА ---
FROM node:20-alpine AS runner

WORKDIR /app

# Копируем только собранный результат
COPY --from=build /app/.output ./.output

ENV PORT=3000
ENV NITRO_PORT=3000
EXPOSE 3000

# Запуск Nitro-сервера
CMD ["node", ".output/server/index.mjs"]
