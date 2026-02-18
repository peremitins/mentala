type SequenceSource = {
  kind: string;
  entityKey: string | null;
  remainingSlots: number;
  customSlotTimes: (number | null)[] | null;
};

type WorkingSource<T extends SequenceSource> = T & {
  usedSlots: number;
  customTimeIndex: number;
};

export type DailySequenceSlot<T extends SequenceSource = SequenceSource> = {
  source: WorkingSource<T>;
  day: 0 | 1;
  fixedTime: number | null;
  isFixed: boolean;
  scheduledAt?: Date;
};

/**
 * Строит последовательность слотов на день с учетом чередования тем.
 * Алгоритм обязан сохранять точные квоты remainingSlots по каждому источнику.
 */
export function buildDailySequence<T extends SequenceSource>(
  sources: T[],
  day: 0 | 1
): DailySequenceSlot<T>[] {
  const sequence: DailySequenceSlot<T>[] = [];

  // Создаем рабочие копии источников с отслеживанием использованных слотов.
  const workingSources = sources.map((source) => ({
    ...source,
    usedSlots: 0,
    customTimeIndex: 0,
  })) as WorkingSource<T>[];

  const therapySources = workingSources.filter(
    (source) => source.kind === 'therapy'
  );
  const habitsSources = workingSources.filter(
    (source) => source.kind === 'habits'
  );

  const therapyWeight = therapySources.reduce(
    (sum, source) => sum + source.remainingSlots,
    0
  );
  const habitsWeight = habitsSources.reduce(
    (sum, source) => sum + source.remainingSlots,
    0
  );

  const hasBothGroups = therapySources.length > 0 && habitsSources.length > 0;

  const therapyPool: Array<{ source: WorkingSource<T>; slotIndex: number }> =
    [];
  const habitsPool: Array<{ source: WorkingSource<T>; slotIndex: number }> = [];

  for (const source of therapySources) {
    for (let index = 0; index < source.remainingSlots; index++) {
      therapyPool.push({ source, slotIndex: index });
    }
  }

  for (const source of habitsSources) {
    for (let index = 0; index < source.remainingSlots; index++) {
      habitsPool.push({ source, slotIndex: index });
    }
  }

  let therapyPoolIndex = 0;
  let habitsPoolIndex = 0;

  let therapyUsed = 0;
  let habitsUsed = 0;

  const lastTopics: string[] = [];

  const totalSlots = workingSources.reduce(
    (sum, source) => sum + source.remainingSlots,
    0
  );

  while (sequence.length < totalSlots) {
    let selectedPoolItem: {
      source: WorkingSource<T>;
      slotIndex: number;
    } | null = null;

    if (hasBothGroups && therapyWeight > 0 && habitsWeight > 0) {
      const totalWeight = therapyWeight + habitsWeight;
      const currentPosition = sequence.length;

      const therapyTarget = Math.floor(
        (currentPosition * therapyWeight) / totalWeight
      );
      const habitsTarget = Math.floor(
        (currentPosition * habitsWeight) / totalWeight
      );

      if (
        therapyUsed <= therapyTarget &&
        therapyPoolIndex < therapyPool.length
      ) {
        selectedPoolItem = therapyPool[therapyPoolIndex];
        therapyPoolIndex++;
        therapyUsed++;
      } else if (
        habitsUsed <= habitsTarget &&
        habitsPoolIndex < habitsPool.length
      ) {
        selectedPoolItem = habitsPool[habitsPoolIndex];
        habitsPoolIndex++;
        habitsUsed++;
      } else {
        if (
          therapyUsed <= habitsUsed &&
          therapyPoolIndex < therapyPool.length
        ) {
          selectedPoolItem = therapyPool[therapyPoolIndex];
          therapyPoolIndex++;
          therapyUsed++;
        } else if (habitsPoolIndex < habitsPool.length) {
          selectedPoolItem = habitsPool[habitsPoolIndex];
          habitsPoolIndex++;
          habitsUsed++;
        }
      }
    } else {
      if (therapySources.length > 0 && therapyPoolIndex < therapyPool.length) {
        selectedPoolItem = therapyPool[therapyPoolIndex];
        therapyPoolIndex++;
      } else if (
        habitsSources.length > 0 &&
        habitsPoolIndex < habitsPool.length
      ) {
        selectedPoolItem = habitsPool[habitsPoolIndex];
        habitsPoolIndex++;
      }
    }

    if (!selectedPoolItem) {
      break;
    }

    let selectedSource = selectedPoolItem.source;
    let sourceKey = `${selectedSource.kind}:${selectedSource.entityKey || 'null'}`;
    const lastTwo = lastTopics.slice(-2);

    if (
      lastTwo.length === 2 &&
      lastTwo[0] === sourceKey &&
      lastTwo[1] === sourceKey
    ) {
      // Для анти-повтора переключаемся только между группами,
      // чтобы не ломать квоты внутри одной группы.
      let alternativePoolItem: typeof selectedPoolItem | null = null;

      if (hasBothGroups) {
        if (
          selectedSource.kind === 'therapy' &&
          habitsPoolIndex < habitsPool.length
        ) {
          alternativePoolItem = habitsPool[habitsPoolIndex];
        } else if (
          selectedSource.kind === 'habits' &&
          therapyPoolIndex < therapyPool.length
        ) {
          alternativePoolItem = therapyPool[therapyPoolIndex];
        }
      }

      if (alternativePoolItem) {
        if (selectedSource.kind === 'therapy') {
          therapyPoolIndex--;
          therapyUsed--;
        } else {
          habitsPoolIndex--;
          habitsUsed--;
        }

        if (alternativePoolItem.source.kind === 'therapy') {
          therapyPoolIndex++;
          therapyUsed++;
        } else {
          habitsPoolIndex++;
          habitsUsed++;
        }

        selectedPoolItem = alternativePoolItem;
        selectedSource = selectedPoolItem.source;
        sourceKey = `${selectedSource.kind}:${selectedSource.entityKey || 'null'}`;
      }
    }

    const customSlotTimes = selectedSource.customSlotTimes;
    let fixedTime: number | null = null;
    let isFixed = false;
    const originalCustomTimeIndex = selectedSource.customTimeIndex;

    if (customSlotTimes && customSlotTimes.length > 0) {
      if (selectedSource.customTimeIndex < customSlotTimes.length) {
        const customTime = customSlotTimes[selectedSource.customTimeIndex];
        if (customTime !== null && customTime !== undefined) {
          fixedTime = customTime;
          isFixed = true;
        }
        selectedSource.customTimeIndex++;
      }
    }

    if (
      lastTwo.length === 2 &&
      lastTwo[0] === sourceKey &&
      lastTwo[1] === sourceKey &&
      !isFixed
    ) {
      const allSources = [...therapySources, ...habitsSources];
      const alternativeSource = allSources.find(
        (source) =>
          source.kind !== selectedSource.kind &&
          `${source.kind}:${source.entityKey || 'null'}` !== sourceKey &&
          source.remainingSlots > 0
      );

      if (alternativeSource) {
        const altPool =
          alternativeSource.kind === 'therapy' ? therapyPool : habitsPool;
        const altIndex =
          alternativeSource.kind === 'therapy'
            ? therapyPoolIndex
            : habitsPoolIndex;

        if (altIndex < altPool.length) {
          const alternativePoolItem = altPool[altIndex];
          if (alternativeSource.kind === 'therapy') {
            therapyPoolIndex++;
            therapyUsed++;
          } else {
            habitsPoolIndex++;
            habitsUsed++;
          }

          // Откатываем сдвиг по customSlotTimes исходного источника,
          // потому что фактически слот будет взят из другого источника.
          selectedSource.customTimeIndex = originalCustomTimeIndex;

          if (selectedSource.kind === 'therapy') {
            therapyPoolIndex--;
            therapyUsed--;
          } else {
            habitsPoolIndex--;
            habitsUsed--;
          }

          selectedPoolItem = alternativePoolItem;
          selectedSource = selectedPoolItem.source;
          sourceKey = `${selectedSource.kind}:${selectedSource.entityKey || 'null'}`;

          fixedTime = null;
          isFixed = false;

          const newCustomSlotTimes = selectedSource.customSlotTimes;
          if (newCustomSlotTimes && newCustomSlotTimes.length > 0) {
            if (selectedSource.customTimeIndex < newCustomSlotTimes.length) {
              const customTime =
                newCustomSlotTimes[selectedSource.customTimeIndex];
              if (customTime !== null && customTime !== undefined) {
                fixedTime = customTime;
                isFixed = true;
              }
              selectedSource.customTimeIndex++;
            }
          }
        }
      }
    }

    sequence.push({
      source: selectedSource,
      day,
      fixedTime,
      isFixed,
    });

    lastTopics.push(sourceKey);
    selectedSource.usedSlots++;
  }

  return sequence;
}
