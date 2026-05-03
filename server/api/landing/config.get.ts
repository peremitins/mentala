import { setHeader } from 'h3';
import type { LandingConfigDto } from '@/shared/dto/landing';

const DEFAULT_CTA_URL = 'https://my.mentala.app/auth';
// Эндпоинт оставлен ради старых закэшированных HTML-лендингов: они могут
// дёргать /api/landing/config, чтобы переключить кнопку на released-режим.
// Конфигурируемого waitlist больше нет — всегда отвечаем «релиз состоялся».
const RELEASE_DATE = new Date('2026-02-16T00:00:00.000Z').toISOString();

export default defineEventHandler((event): LandingConfigDto => {
  setHeader(
    event,
    'Cache-Control',
    'public, max-age=300, stale-while-revalidate=600'
  );

  return {
    isReleased: true,
    ctaUrl: DEFAULT_CTA_URL,
    updatedAt: RELEASE_DATE,
  };
});
