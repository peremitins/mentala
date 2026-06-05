import { readonly, ref } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import type { TodayResponseDto } from '@/shared/dto/retention';

export type PlantWaterIntensity = 'small' | 'medium' | 'large';

export type PlantWaterSource =
  | 'free_practice'
  | 'mood_checkin'
  | 'thought_of_the_day'
  | 'program_step';

export type PlantWaterFeedback = {
  signal: number;
  intensity: PlantWaterIntensity;
  source: PlantWaterSource;
  energyToday?: number;
  energyWeekly?: number;
  createdAtMs: number;
};

export type PlantWaterSnapshot = {
  completedSteps: number;
  totalSteps: number;
  plantSetSlug?: string | null;
};

const waterSignal = ref(0);
const latestWater = ref<PlantWaterFeedback | null>(null);
const plantSnapshot = ref<PlantWaterSnapshot | null>(null);

let plantSnapshotPromise: Promise<PlantWaterSnapshot | null> | null = null;

export function notifyPlantWater(params: {
  intensity: PlantWaterIntensity;
  source: PlantWaterSource;
  energyToday?: number;
  energyWeekly?: number;
}) {
  waterSignal.value += 1;
  latestWater.value = {
    signal: waterSignal.value,
    intensity: params.intensity,
    source: params.source,
    energyToday: params.energyToday,
    energyWeekly: params.energyWeekly,
    createdAtMs: Date.now(),
  };
}

export function setPlantWaterSnapshot(snapshot: PlantWaterSnapshot | null) {
  plantSnapshot.value = snapshot;
}

export async function loadPlantWaterSnapshot(options?: {
  force?: boolean;
}): Promise<PlantWaterSnapshot | null> {
  if (typeof window === 'undefined') return plantSnapshot.value;
  if (plantSnapshot.value && !options?.force) return plantSnapshot.value;
  if (plantSnapshotPromise && !options?.force) return plantSnapshotPromise;

  plantSnapshotPromise = useAPI<TodayResponseDto>('/api/today', {
    suppressAuthRedirect: true,
    suppressErrorToast: true,
  })
    .then((today) => {
      const snapshot: PlantWaterSnapshot = {
        completedSteps: today.program.completedSteps,
        totalSteps: today.program.totalSteps,
        plantSetSlug: today.program.plantSetSlug,
      };
      setPlantWaterSnapshot(snapshot);
      return snapshot;
    })
    .catch((error) => {
      console.warn(
        '[PlantWaterFeedback] Не удалось загрузить растение для хедера:',
        error
      );
      return null;
    })
    .finally(() => {
      plantSnapshotPromise = null;
    });

  return plantSnapshotPromise;
}

export function usePlantWaterFeedback() {
  return {
    waterSignal: readonly(waterSignal),
    latestWater: readonly(latestWater),
    plantSnapshot: readonly(plantSnapshot),
    loadPlantSnapshot: loadPlantWaterSnapshot,
  };
}
