<template>
  <button
    type="button"
    class="relative h-9 w-9 shrink-0 rounded-[14px] bg-transparent p-0 transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none"
    :aria-label="isVisible ? 'Открыть оранжерею' : undefined"
    :aria-hidden="!isVisible"
    :tabindex="isVisible ? 0 : -1"
    :disabled="!isVisible"
    @click="openGarden"
  >
    <RetentionPlantWaterFrame
      v-if="isVisible"
      :src="plantSrc"
      :fallback-src="plantFallbackSrc"
      :water-signal="waterSignal"
      :water-intensity="latestWater?.intensity ?? 'medium'"
      :frame-px="36"
      frame-class="plant-frame relative h-9 w-9 rounded-[14px] transition-opacity duration-200"
      glow-class="-inset-3"
      glow-variant="header"
      image-class="plant-stage-image absolute inset-0 h-full w-full rounded-[14px] object-contain"
      @image-error="handlePlantImageError"
    />
  </button>
</template>

<script setup lang="ts">
import { navigateTo } from '#app';
import { computed, onMounted } from 'vue';
import RetentionPlantWaterFrame from '@/app/components/retention/RetentionPlantWaterFrame.vue';
import { usePlantWaterFeedback } from '@/app/composables/usePlantWaterFeedback';
import {
  getRetentionPlantFallbackSrc,
  getRetentionPlantImageSrc,
  getRetentionPlantStateIndex,
} from '@/app/utils/retentionPlant';

const { waterSignal, latestWater, plantSnapshot, loadPlantSnapshot } =
  usePlantWaterFeedback();

const isVisible = computed(
  () => Boolean(plantSnapshot.value) && plantSrc.value
);

const stageIndex = computed(() => {
  if (!plantSnapshot.value) return 0;
  return getRetentionPlantStateIndex(
    plantSnapshot.value.completedSteps,
    plantSnapshot.value.totalSteps
  );
});

const plantSrc = computed(() => {
  if (!plantSnapshot.value) return '';
  return getRetentionPlantImageSrc(
    stageIndex.value,
    plantSnapshot.value.plantSetSlug
  );
});

const plantFallbackSrc = computed(() =>
  getRetentionPlantFallbackSrc(stageIndex.value)
);

function handlePlantImageError(src: string) {
  console.warn('[HeaderPlant] Не удалось загрузить изображение:', src);
}

function openGarden() {
  if (!isVisible.value) return;

  void navigateTo('/garden');
}

onMounted(() => {
  void loadPlantSnapshot();
});
</script>
