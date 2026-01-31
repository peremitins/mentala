FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
# Детерминированная установка зависимостей по lock-файлу.
RUN npm ci

COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.js"]
