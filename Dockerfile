# --- СТАДИЯ СБОРКИ ---
FROM node:20-alpine AS build

WORKDIR /app

# Включаем corepack и фиксируем pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Копируем файлы для установки зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости строго по pnpm-lock
RUN pnpm install --frozen-lockfile

# Копируем весь проект
COPY . .

# Сборка Nuxt (Nitro складывает сервер в .output)
RUN pnpm build


# --- СТАДИЯ РАНТАЙМА ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NITRO_PORT=3000

# Копируем только собранный результат
COPY --from=build /app/.output ./.output

EXPOSE 3000

# Запуск Nitro-сервера
CMD ["node", ".output/server/index.mjs"]