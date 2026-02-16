type BuildFlexibleSlotMinutesParams = {
  rangeStart: number;
  rangeEnd: number;
  slotsCount: number;
  phaseFraction?: number;
};

function clampPhaseFraction(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value as number));
}

/**
 * Строит базовые минуты для гибких слотов:
 * - учитывает фазу источника (phaseFraction), чтобы темы не склеивались по времени;
 * - 1 слот: точка внутри диапазона по фазе;
 * - 2+ слотов: равномерно по сегментам диапазона (без принудительного попадания на края).
 */
export function buildFlexibleSlotMinutes(
  params: BuildFlexibleSlotMinutesParams
): number[] {
  const { rangeStart, rangeEnd, slotsCount, phaseFraction } = params;
  if (slotsCount <= 0) return [];

  const span = Math.max(0, rangeEnd - rangeStart);
  const phase = clampPhaseFraction(phaseFraction);

  if (slotsCount === 1) {
    return [rangeStart + span * phase];
  }

  const segmentSize = span / slotsCount;
  const result: number[] = [];

  for (let index = 0; index < slotsCount; index++) {
    result.push(rangeStart + segmentSize * (index + phase));
  }

  return result;
}

type BuildSourcePhaseMapParams = {
  sourceKeys: string[];
};

/**
 * Возвращает детерминированную фазу [0..1] для каждого sourceKey.
 * Используется для глобального "размазывания" тем внутри одного дня.
 */
export function buildSourcePhaseMap(
  params: BuildSourcePhaseMapParams
): Map<string, number> {
  const uniqueSortedKeys = [...new Set(params.sourceKeys)].sort();
  const total = uniqueSortedKeys.length;
  const phaseMap = new Map<string, number>();

  if (total === 0) {
    return phaseMap;
  }

  if (total === 1) {
    phaseMap.set(uniqueSortedKeys[0], 0.5);
    return phaseMap;
  }

  for (let index = 0; index < uniqueSortedKeys.length; index++) {
    // Фаза строго внутри (0..1), чтобы не прилипать к границам диапазона.
    const phase = (index + 1) / (total + 1);
    phaseMap.set(uniqueSortedKeys[index], phase);
  }

  return phaseMap;
}

type ApplyFlexibleSlotJitterParams = {
  baseMinutes: number;
  slotIndex: number;
  slotsCount: number;
  jitterMinutes: number;
};

/**
 * Применяет джиттер только к внутренним слотам.
 * Первый и последний слот в наборе остаются без джиттера.
 */
export function applyFlexibleSlotJitter(
  params: ApplyFlexibleSlotJitterParams
): number {
  const { baseMinutes, slotIndex, slotsCount, jitterMinutes } = params;

  const isEdgeSlot = slotIndex === 0 || slotIndex === slotsCount - 1;
  if (slotsCount <= 2 || isEdgeSlot) {
    return baseMinutes;
  }

  return baseMinutes + jitterMinutes;
}
