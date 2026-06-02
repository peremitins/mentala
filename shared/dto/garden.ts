import { z } from 'zod';

/**
 * DTO Оранжереи (см. retention/retention_long_term_strategy.md и §8.2).
 *
 * Контракт между сервером и клиентом для коллекции выращенных растений.
 * Backward compat: новые поля добавляются как optional/nullable.
 * Старые клиенты, не знающие про `GardenResponseDto`, не вызывают этот endpoint.
 */

// Превью сохранённой мысли периода — показывается на лор-карточке растения.
export const GardenSavedThoughtPreviewDto = z.object({
  id: z.number().int().positive(),
  text: z.string(),
  savedAt: z.string().nullable(),
});

export const GardenPlantItemDto = z.object({
  programSlug: z.string().min(1).max(80),
  plantSetSlug: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  summaryText: z.string().nullable(),
  completedAt: z.string().nullable(),
  stateIndex: z.number().int().min(0).max(32),
  /** ID-only список — backward compat для старых клиентов. */
  savedThoughtIds: z.array(z.number().int().positive()).default([]),
  /** Полные превью сохранённых мыслей периода. */
  savedThoughts: z.array(GardenSavedThoughtPreviewDto).default([]),
});

export const GardenAvailableProgramDto = z.object({
  programSlug: z.string().min(1).max(80),
  plantSetSlug: z.string().min(1).max(40).nullable(),
  title: z.string().min(1).max(120),
  subtitle: z.string().nullable(),
  totalSteps: z.number().int().positive(),
  difficulty: z.string().nullable(),
  summaryText: z.string().nullable(),
});

export const GardenLockedSilhouetteDto = z.object({
  programSlug: z.string().min(1).max(80),
  plantSetSlug: z.string().min(1).max(40).nullable(),
  title: z.string().min(1).max(120),
  unlockHint: z.string(),
  remainingToUnlock: z.number().int().min(0),
  /** Краткое описание Сада для тизер-карточки и модалки. */
  subtitle: z.string().nullable().default(null),
  /**
   * Причина «замка»:
   *  - 'sequential'  — контент готов, откроется после N завершённых Садов;
   *  - 'coming_soon' — Сад ещё в разработке (контента шагов нет).
   * default 'sequential' — backward compat для старых клиентов.
   */
  lockMode: z.enum(['sequential', 'coming_soon']).default('sequential'),
});

export const GardenResponseDto = z.object({
  active: GardenPlantItemDto.nullable(),
  completed: z.array(GardenPlantItemDto),
  available: z.array(GardenAvailableProgramDto),
  lockedSilhouettes: z.array(GardenLockedSilhouetteDto),
});

export const GardenStartRequestDto = z.object({
  programSlug: z.string().trim().min(1).max(80),
});

export const GardenStartResponseDto = z.object({
  ok: z.literal(true),
  programSlug: z.string(),
});

export const ProgramListItemDto = GardenAvailableProgramDto.extend({
  unlocked: z.boolean(),
  completedAt: z.string().nullable(),
});

export const ProgramListResponseDto = z.object({
  items: z.array(ProgramListItemDto),
});

export type GardenSavedThoughtPreviewDto = z.infer<
  typeof GardenSavedThoughtPreviewDto
>;
export type GardenPlantItemDto = z.infer<typeof GardenPlantItemDto>;
export type GardenAvailableProgramDto = z.infer<
  typeof GardenAvailableProgramDto
>;
export type GardenLockedSilhouetteDto = z.infer<
  typeof GardenLockedSilhouetteDto
>;
export type GardenResponseDto = z.infer<typeof GardenResponseDto>;
export type GardenStartRequestDto = z.infer<typeof GardenStartRequestDto>;
export type GardenStartResponseDto = z.infer<typeof GardenStartResponseDto>;
export type ProgramListItemDto = z.infer<typeof ProgramListItemDto>;
export type ProgramListResponseDto = z.infer<typeof ProgramListResponseDto>;
