import { defineEventHandler, setResponseStatus } from 'h3';
import { setLandingCorsHeaders } from '@/server/utils/landing-cors';

/**
 * Обработка preflight OPTIONS для /api/landing/lead.
 * Важно: чтобы preflight доходил сюда, эндпоинт не должен требовать Basic Auth
 * на уровне Traefik/прокси (иначе OPTIONS получит 401 до Nuxt и CORS не сработает).
 */
export default defineEventHandler((event) => {
  setLandingCorsHeaders(event);
  setResponseStatus(event, 204);
  return undefined;
});
