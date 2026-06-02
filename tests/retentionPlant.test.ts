import { describe, expect, it } from 'vitest';
import {
  getRetentionPlantFallbackSrc,
  getRetentionPlantImageSrc,
  getRetentionPlantNextThreshold,
  getRetentionPlantStepThresholds,
  getRetentionPlantStateIndex,
  getRetentionPlantTitle,
  RETENTION_PLANT_STATE_COUNT,
} from '../app/utils/retentionPlant';

describe('retention plant', () => {
  it('содержит 15 стадий (без отдельных кадров семени/ростка)', () => {
    expect(RETENTION_PLANT_STATE_COUNT).toBe(15);
  });

  it('раскладывает 30 шагов программы на 15 состояний растения без спец-кейса', () => {
    expect(getRetentionPlantStepThresholds(30)).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30,
    ]);
    expect(getRetentionPlantStateIndex(0, 30)).toBe(0);
    expect(getRetentionPlantStateIndex(1, 30)).toBe(0);
    expect(getRetentionPlantStateIndex(2, 30)).toBe(1);
    expect(getRetentionPlantStateIndex(4, 30)).toBe(2);
    // Threshold для предпоследней stage (index 13) = 26 шагов.
    expect(getRetentionPlantStateIndex(26, 30)).toBe(13);
    // Последняя stage (index 14) = 30 шагов.
    expect(getRetentionPlantStateIndex(30, 30)).toBe(14);
  });

  it('масштабирует 15 состояний на произвольную 21-шаговую программу', () => {
    expect(getRetentionPlantStepThresholds(21)).toEqual([
      0, 2, 3, 5, 6, 7, 9, 10, 12, 13, 14, 16, 17, 19, 21,
    ]);
    expect(getRetentionPlantStateIndex(20, 21)).toBe(13);
    expect(getRetentionPlantStateIndex(21, 21)).toBe(14);
    expect(getRetentionPlantNextThreshold(13, 21)).toBe(21);
  });

  it('строит пороги для любой длины программы, а не только для известных садов', () => {
    for (const totalSteps of [15, 17, 23, 31, 42]) {
      const thresholds = getRetentionPlantStepThresholds(totalSteps);
      expect(thresholds).toHaveLength(RETENTION_PLANT_STATE_COUNT);
      expect(thresholds[0]).toBe(0);
      expect(thresholds.at(-1)).toBe(totalSteps);
      expect(getRetentionPlantStateIndex(totalSteps, totalSteps)).toBe(14);

      for (let index = 1; index < thresholds.length; index += 1) {
        expect(thresholds[index]).toBeGreaterThanOrEqual(
          thresholds[index - 1] ?? 0
        );
      }
    }
  });

  it('возвращает production webp и fallback svg пути', () => {
    // Без plantSetSlug — старый путь для backward compat.
    expect(getRetentionPlantImageSrc(0)).toBe(
      '/retention/plant/states/plant-01.webp'
    );
    expect(getRetentionPlantImageSrc(14)).toBe(
      '/retention/plant/states/plant-15.webp'
    );
    expect(getRetentionPlantFallbackSrc(14)).toBe(
      '/retention/plant/stage-7.svg'
    );
  });

  it('подставляет plant_set_slug как подпапку', () => {
    expect(getRetentionPlantImageSrc(0, 'orchid')).toBe(
      '/retention/plant/states/orchid/plant-01.webp'
    );
    expect(getRetentionPlantImageSrc(14, 'peony')).toBe(
      '/retention/plant/states/peony/plant-15.webp'
    );
  });

  it('игнорирует пустой/нулевой plantSetSlug (backward compat)', () => {
    expect(getRetentionPlantImageSrc(0, '')).toBe(
      '/retention/plant/states/plant-01.webp'
    );
    expect(getRetentionPlantImageSrc(0, null)).toBe(
      '/retention/plant/states/plant-01.webp'
    );
    expect(getRetentionPlantImageSrc(0, undefined)).toBe(
      '/retention/plant/states/plant-01.webp'
    );
  });

  it('считает следующий порог роста', () => {
    expect(getRetentionPlantNextThreshold(0, 30)).toBe(2);
    // Переход к последней стадии (index 14) — 30 шагов.
    expect(getRetentionPlantNextThreshold(13, 30)).toBe(30);
    // Последняя стадия (index 14) — следующего порога нет.
    expect(getRetentionPlantNextThreshold(14, 30)).toBeNull();
  });

  it('подбирает подписи под фактический набор растения', () => {
    expect(getRetentionPlantTitle(3)).toBe('Растение крепнет');
    expect(getRetentionPlantTitle(3, 'orchid')).toBe('Первые цветы');
    expect(getRetentionPlantTitle(0, 'peony')).toBe('Появился росток');
    expect(getRetentionPlantTitle(14, 'peony')).toBe('Пышное цветение');
  });
});
