import { describe, expect, it } from 'vitest';
import {
  applyFlexibleSlotJitter,
  buildFlexibleSlotMinutes,
  buildSourcePhaseMap,
} from '../server/application/notifications/slot-distribution.utils';

describe('notification slot distribution', () => {
  it('распределяет 3 слота по сегментам диапазона (без прилипания к краям)', () => {
    const minutes = buildFlexibleSlotMinutes({
      rangeStart: 540,
      rangeEnd: 1350,
      slotsCount: 3,
    });

    expect(minutes).toEqual([675, 945, 1215]);
  });

  it('для одного слота учитывает phaseFraction внутри окна', () => {
    const early = buildFlexibleSlotMinutes({
      rangeStart: 540,
      rangeEnd: 1350,
      slotsCount: 1,
      phaseFraction: 0,
    });

    const late = buildFlexibleSlotMinutes({
      rangeStart: 540,
      rangeEnd: 1350,
      slotsCount: 1,
      phaseFraction: 1,
    });

    expect(early[0]).toBe(540);
    expect(late[0]).toBe(1350);
  });

  it('строит детерминированные фазы для источников без крайних значений', () => {
    const phaseMap = buildSourcePhaseMap({
      sourceKeys: ['1:habits:smoking', '1:habits:alcohol', '1:therapy:sos'],
    });

    const phases = [...phaseMap.values()].sort((a, b) => a - b);
    expect(phases.length).toBe(3);
    expect(phases[0]).toBeGreaterThan(0);
    expect(phases[2]).toBeLessThan(1);
    expect(phaseMap.get('1:habits:alcohol')).toBeDefined();
  });

  it('не применяет джиттер к первому и последнему слоту', () => {
    const baseMinutes = buildFlexibleSlotMinutes({
      rangeStart: 540,
      rangeEnd: 1350,
      slotsCount: 5,
      phaseFraction: 0.5,
    });

    const jittered = baseMinutes.map((minute, index) =>
      applyFlexibleSlotJitter({
        baseMinutes: minute,
        slotIndex: index,
        slotsCount: baseMinutes.length,
        jitterMinutes: 12,
      })
    );

    expect(jittered[0]).toBe(baseMinutes[0]);
    expect(jittered[jittered.length - 1]).toBe(
      baseMinutes[baseMinutes.length - 1]
    );
    expect(jittered[2]).toBe(baseMinutes[2] + 12);
  });
});
