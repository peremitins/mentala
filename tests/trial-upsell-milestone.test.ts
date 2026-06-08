import { describe, expect, it } from 'vitest';

import {
  pickDueMilestone,
  TRIAL_UPSELL_MILESTONES,
} from '../server/application/subscriptions/trial-upsell.service';

describe('trial upsell milestone selection', () => {
  it('контрольные точки заданы как 1 / 5 / 10', () => {
    expect([...TRIAL_UPSELL_MILESTONES]).toEqual([1, 5, 10]);
  });

  it('показывает точку 1 после первого шага', () => {
    expect(pickDueMilestone(1, 0)).toBe(1);
  });

  it('ничего не показывает между точками', () => {
    expect(pickDueMilestone(2, 1)).toBeNull();
    expect(pickDueMilestone(4, 1)).toBeNull();
    expect(pickDueMilestone(9, 5)).toBeNull();
  });

  it('показывает точку 5 и 10 на соответствующих шагах', () => {
    expect(pickDueMilestone(5, 1)).toBe(5);
    expect(pickDueMilestone(10, 5)).toBe(10);
  });

  it('берёт наибольшую достигнутую точку, если пользователь проскочил шаги', () => {
    // Не показывали ничего, но юзер за одну сессию дошёл до 7 шагов:
    // показываем 5 (последнюю достигнутую), а не устаревшую 1.
    expect(pickDueMilestone(7, 0)).toBe(5);
    // Дошёл до 12, показывали только 1 → показываем 10.
    expect(pickDueMilestone(12, 1)).toBe(10);
  });

  it('не повторяет уже показанную точку', () => {
    expect(pickDueMilestone(1, 1)).toBeNull();
    expect(pickDueMilestone(5, 5)).toBeNull();
    expect(pickDueMilestone(10, 10)).toBeNull();
  });

  it('после последней точки (10) больше ничего не показывает', () => {
    expect(pickDueMilestone(15, 10)).toBeNull();
    expect(pickDueMilestone(100, 10)).toBeNull();
  });

  it('не показывает ничего при нулевом прогрессе', () => {
    expect(pickDueMilestone(0, 0)).toBeNull();
  });
});
