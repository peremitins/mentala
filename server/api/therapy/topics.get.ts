import { THERAPY_TOPICS, type TherapyTopic } from '@/app/lib/therapyCatalog';

/**
 * GET /api/therapy/topics
 * Получить список всех тем терапии (статичный справочник)
 */
export default defineEventHandler(async (): Promise<TherapyTopic[]> => {
  // Возвращаем статичный список тем из кода
  // Аутентификация не требуется — это публичный справочник
  return [...THERAPY_TOPICS];
});
