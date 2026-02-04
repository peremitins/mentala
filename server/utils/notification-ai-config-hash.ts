/**
 * Утилита для вычисления хеша конфигурации генерации AI-текстов уведомлений
 * Хеш используется для определения необходимости регенерации текстов
 */

import { createHash } from 'node:crypto';

import type {
  Tone,
  Addressing,
  Directness,
  HabitSubtype,
} from '@/shared/dto/notifications';

export interface GenerationConfig {
  entityName: string;
  entityDescription?: string | null;
  tone: Tone;
  addressing: Addressing;
  directness: Directness;
  subtype?: HabitSubtype | null;
  textSource: 'ai'; // Только для AI-генерации (не может быть 'templates')
  kind: 'habits' | 'therapy';
  habitIntent?: 'quit' | 'build' | null; // Intent привычки: отказ (quit) или приобретение (build). Только для habits.
  userGender?: 'male' | 'female' | null;
}

/**
 * Вычисляет SHA-256 хеш конфигурации генерации
 * Хеш используется для определения, нужно ли регенерировать тексты
 *
 * @param config - Конфигурация генерации
 * @returns SHA-256 хеш в hex формате
 */
export function computeGenerationConfigHash(config: GenerationConfig): string {
  // Нормализуем данные для стабильного хеширования
  // Важно: порядок полей должен быть фиксированным
  // habitIntent включается в хеш только для habits, чтобы при изменении intent генерировался новый пул
  const normalized = {
    entityName: (config.entityName || '').trim().toLowerCase(),
    entityDescription: (config.entityDescription || '').trim().toLowerCase(),
    tone: config.tone,
    addressing: config.addressing,
    directness: config.directness,
    subtype: config.subtype || null,
    textSource: config.textSource,
    kind: config.kind,
    habitIntent: config.habitIntent || null, // Включаем в хеш для habits (для therapy всегда null)
    userGender: config.userGender || null,
  };

  // Создаем стабильный JSON (без пробелов для консистентности)
  const json = JSON.stringify(normalized);

  // Вычисляем SHA-256 хеш
  return createHash('sha256').update(json).digest('hex');
}
