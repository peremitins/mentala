import { defineEventHandler, setResponseHeader } from 'h3'

// Лёгкий liveness-пробник для Docker HEALTHCHECK и reverse-proxy.
// Не дёргает БД/Redis — только подтверждает, что Nitro отвечает.
// Для глубокой проверки зависимостей используется /api/db/health.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { ok: true, ts: Date.now() }
})
