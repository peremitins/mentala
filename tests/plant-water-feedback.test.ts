import { describe, expect, it, vi } from 'vitest';

async function loadPlantWaterFeedback() {
  vi.resetModules();
  return await import('../app/composables/usePlantWaterFeedback');
}

describe('plant water feedback', () => {
  it('публикует общий water-сигнал для карточки ростка и хедера', async () => {
    const { notifyPlantWater, usePlantWaterFeedback } =
      await loadPlantWaterFeedback();
    const feedback = usePlantWaterFeedback();

    expect(feedback.waterSignal.value).toBe(0);
    expect(feedback.latestWater.value).toBeNull();

    notifyPlantWater({ intensity: 'small', source: 'thought_of_the_day' });

    expect(feedback.waterSignal.value).toBe(1);
    expect(feedback.latestWater.value).toMatchObject({
      signal: 1,
      intensity: 'small',
      source: 'thought_of_the_day',
    });
  });
});
