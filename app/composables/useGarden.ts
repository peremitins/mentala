import { computed, ref } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import {
  GardenResponseDto,
  GardenStartResponseDto,
  type GardenAvailableProgramDto,
  type GardenLockedSilhouetteDto,
  type GardenPlantItemDto,
  type GardenResponseDto as GardenResponseDtoType,
} from '@/shared/dto/garden';

/**
 * Composable для экрана Оранжереи (`/garden`).
 *
 * Обёртка над `GET /api/garden` + `POST /api/garden/start`. Кеширование state
 * локальное (не Pinia) — каждое монтирование `/garden` подтягивает свежий
 * snapshot, потому что коллекция меняется редко, но visit rate низкий и
 * принять stale-данные нежелательно.
 *
 * Использование:
 *   const garden = useGarden();
 *   await garden.load();
 *   garden.snapshot.value; // GardenResponseDto | null
 *   await garden.startProgram('self_kindness_21');
 */

export function useGarden() {
  const snapshot = ref<GardenResponseDtoType | null>(null);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);

  async function load(): Promise<void> {
    isLoading.value = true;
    loadError.value = null;
    try {
      const raw = await useAPI<unknown>('/api/garden', {
        method: 'GET',
        suppressErrorToast: true,
      });
      snapshot.value = GardenResponseDto.parse(raw);
    } catch (error) {
      console.error('[useGarden] failed to load /api/garden:', error);
      loadError.value =
        (error as Error)?.message || 'Не удалось загрузить оранжерею';
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Стартует выбранный Сад. Серверный assertProgramUnlocked может вернуть 403
   * (E_FORBIDDEN) — это валидный сценарий «пользователь увидел силуэт и нажал»,
   * вызывающий код должен дать toast или paywall-подобный UI.
   */
  async function startProgram(
    programSlug: string
  ): Promise<{ ok: boolean; programSlug: string } | null> {
    try {
      const raw = await useAPI<unknown>('/api/garden/start', {
        method: 'POST',
        body: { programSlug },
        suppressErrorToast: true,
      });
      const parsed = GardenStartResponseDto.parse(raw);
      // После успешного старта state коллекции стал stale (active изменился).
      await load();
      return parsed;
    } catch (error) {
      console.error('[useGarden] failed to start program:', error);
      throw error;
    }
  }

  const activePlant = computed<GardenPlantItemDto | null>(
    () => snapshot.value?.active ?? null
  );
  const completedPlants = computed<GardenPlantItemDto[]>(
    () => snapshot.value?.completed ?? []
  );
  const availableSeeds = computed<GardenAvailableProgramDto[]>(
    () => snapshot.value?.available ?? []
  );
  const lockedSilhouettes = computed<GardenLockedSilhouetteDto[]>(
    () => snapshot.value?.lockedSilhouettes ?? []
  );

  const hasAnyContent = computed(
    () =>
      Boolean(activePlant.value) ||
      completedPlants.value.length > 0 ||
      availableSeeds.value.length > 0 ||
      lockedSilhouettes.value.length > 0
  );

  return {
    snapshot,
    isLoading,
    loadError,
    activePlant,
    completedPlants,
    availableSeeds,
    lockedSilhouettes,
    hasAnyContent,
    load,
    startProgram,
  };
}
