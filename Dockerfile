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

# Публичный Firebase Web config нужен именно во время сборки:
# Vite статически подставляет import.meta.env в клиентский bundle и service worker.
ARG MENTALA_REQUIRE_WEB_PUSH_BUILD_CONFIG=false
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_VAPID_PUBLIC_KEY

ENV VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY}" \
    VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN}" \
    VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID}" \
    VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET}" \
    VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
    VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID}" \
    VITE_FIREBASE_VAPID_PUBLIC_KEY="${VITE_FIREBASE_VAPID_PUBLIC_KEY}"

RUN if [ "$MENTALA_REQUIRE_WEB_PUSH_BUILD_CONFIG" = "true" ]; then \
      missing=0; \
      for name in \
        VITE_FIREBASE_API_KEY \
        VITE_FIREBASE_AUTH_DOMAIN \
        VITE_FIREBASE_PROJECT_ID \
        VITE_FIREBASE_STORAGE_BUCKET \
        VITE_FIREBASE_MESSAGING_SENDER_ID \
        VITE_FIREBASE_APP_ID \
        VITE_FIREBASE_VAPID_PUBLIC_KEY; do \
        eval "value=\${$name:-}"; \
        if [ -z "$value" ]; then \
          echo "Missing required web push build arg: $name" >&2; \
          missing=1; \
        fi; \
      done; \
      [ "$missing" -eq 0 ]; \
    fi

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
