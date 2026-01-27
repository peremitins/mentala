import { computed, type Ref, watchEffect } from 'vue';

export interface TimeRangeValue {
  start: number;
  end: number;
}

const MAX_SLOTS = 5;

function ensureLength(value: (number | null | undefined)[]): (number | null)[] {
  return Array.from({ length: MAX_SLOTS }, (_, index) => {
    const entry = value?.[index];
    return entry === null || entry === undefined ? null : Math.round(entry);
  });
}

function arraysEqual(a: (number | null)[], b: (number | null)[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function useTimeSlotControls(
  timesPerDay: Ref<number>,
  timeRange: Ref<TimeRangeValue>,
  customSlotTimes: Ref<(number | null)[]>
) {
  customSlotTimes.value = ensureLength(customSlotTimes.value ?? []);

  const hasCustomTimes = computed(() =>
    customSlotTimes.value.some((value) => typeof value === 'number')
  );

  function getAutoSuggestion(index: number): number {
    const start = timeRange.value.start ?? 540;
    const end = timeRange.value.end ?? 1350;
    const crossesMidnight = start > end;
    const windowDuration = crossesMidnight
      ? 1440 - start + end
      : end - start || 60;
    const step = windowDuration / Math.max(timesPerDay.value, 1);

    let slotMinutes = start + step * index + step / 2;
    if (crossesMidnight && slotMinutes >= 1440) {
      slotMinutes = slotMinutes % 1440;
    }
    return Math.round(slotMinutes);
  }

  const slots = computed(() =>
    Array.from({ length: MAX_SLOTS }, (_, index) => {
      const manualValue = customSlotTimes.value[index];
      const isManual = typeof manualValue === 'number';
      const isActive = index < timesPerDay.value;

      const minutes =
        isManual && manualValue !== null
          ? manualValue
          : isActive
            ? getAutoSuggestion(index)
            : null;

      return {
        index,
        number: index + 1,
        minutes,
        isManual,
        isActive,
      };
    })
  );

  function setManualTime(index: number, minutes: number) {
    const next = ensureLength(customSlotTimes.value);
    next[index] = Math.round(minutes);
    customSlotTimes.value = next;
  }

  function resetAllSlotTimes() {
    customSlotTimes.value = Array(MAX_SLOTS).fill(null);
  }

  watchEffect(() => {
    const next = ensureLength(customSlotTimes.value);
    if (!arraysEqual(customSlotTimes.value, next)) {
      customSlotTimes.value = next;
    }
  });

  return {
    slots,
    hasCustomTimes,
    setManualTime,
    resetAllSlotTimes,
  };
}
