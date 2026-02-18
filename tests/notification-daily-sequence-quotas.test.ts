import { describe, expect, it } from 'vitest';
import { buildDailySequence } from '../server/application/notifications/daily-sequence.utils';

type SourceSeed = {
  kind: 'habits' | 'therapy';
  entityKey: string;
  remainingSlots: number;
  customSlotTimes?: (number | null)[] | null;
};

function createSources(seeds: SourceSeed[]) {
  return seeds.map((seed) => ({
    preference: { userId: 50 },
    kind: seed.kind,
    entityKey: seed.entityKey,
    normalizedEntityKey: seed.entityKey,
    isCustomEntity: false,
    timesPerDay: seed.remainingSlots,
    timeRangeStart: 540,
    timeRangeEnd: 1350,
    customSlotTimes: seed.customSlotTimes ?? null,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    crossesMidnight: false,
    interval: 120,
    sentToday: 0,
    remainingSlots: seed.remainingSlots,
  })) as any[];
}

function toSourceKey(slot: any): string {
  return `${slot.source.kind}:${slot.source.entityKey || 'null'}`;
}

describe('buildDailySequence quotas', () => {
  it('сохраняет точные квоты источников при смешанных группах', () => {
    const seeds: SourceSeed[] = [
      { kind: 'therapy', entityKey: 'sos', remainingSlots: 1 },
      { kind: 'habits', entityKey: 'alcohol', remainingSlots: 5 },
      { kind: 'habits', entityKey: 'smoking', remainingSlots: 5 },
      { kind: 'habits', entityKey: 'nutrition', remainingSlots: 5 },
    ];

    const sequence = buildDailySequence(
      createSources(seeds) as any,
      1 as 0 | 1
    );

    const counts = new Map<string, number>();
    for (const slot of sequence as any[]) {
      const key = toSourceKey(slot);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const expectedTotal = seeds.reduce(
      (sum, source) => sum + source.remainingSlots,
      0
    );
    expect(sequence.length).toBe(expectedTotal);

    for (const source of seeds) {
      const key = `${source.kind}:${source.entityKey}`;
      expect(counts.get(key) || 0).toBe(source.remainingSlots);
    }
  });

  it('сохраняет точные квоты источников в одной группе', () => {
    const seeds: SourceSeed[] = [
      { kind: 'habits', entityKey: 'alcohol', remainingSlots: 5 },
      { kind: 'habits', entityKey: 'smoking', remainingSlots: 5 },
      { kind: 'habits', entityKey: 'nutrition', remainingSlots: 5 },
      { kind: 'habits', entityKey: 'water', remainingSlots: 5 },
    ];

    const sequence = buildDailySequence(
      createSources(seeds) as any,
      1 as 0 | 1
    );

    const counts = new Map<string, number>();
    for (const slot of sequence as any[]) {
      const key = toSourceKey(slot);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const expectedTotal = seeds.reduce(
      (sum, source) => sum + source.remainingSlots,
      0
    );
    expect(sequence.length).toBe(expectedTotal);

    for (const source of seeds) {
      const key = `${source.kind}:${source.entityKey}`;
      expect(counts.get(key) || 0).toBe(source.remainingSlots);
    }
  });

  it('учитывает fixed customSlotTimes в пределах квоты источника', () => {
    const seeds: SourceSeed[] = [
      {
        kind: 'habits',
        entityKey: 'alcohol',
        remainingSlots: 5,
        customSlotTimes: [540, null, 720, null, 900],
      },
      { kind: 'habits', entityKey: 'smoking', remainingSlots: 5 },
      { kind: 'therapy', entityKey: 'sos', remainingSlots: 2 },
    ];

    const sequence = buildDailySequence(
      createSources(seeds) as any,
      1 as 0 | 1
    );

    const counts = new Map<string, number>();
    for (const slot of sequence as any[]) {
      const key = toSourceKey(slot);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    for (const source of seeds) {
      const key = `${source.kind}:${source.entityKey}`;
      expect(counts.get(key) || 0).toBe(source.remainingSlots);
    }
  });
});
