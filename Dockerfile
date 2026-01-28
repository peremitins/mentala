# --- СТАДИЯ СБОРКИ ---
FROM node:20-alpine AS build

# Включаем corepack, чтобы был pnpm
RUN corepack enable

WORKDIR /app

# Копируем файлы для установки зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости строго по pnpm-lock
RUN pnpm install --frozen-lockfile

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
