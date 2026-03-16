import { computed } from 'vue';
import { useMediaQuery, useWindowSize } from '@vueuse/core';

export function useViewportOrientation() {
  const isPortraitQuery = useMediaQuery('(orientation: portrait)');
  const { width, height } = useWindowSize();

  const isPortraitMode = computed(() => {
    // Основной источник истины — реальные размеры viewport.
    // Media query оставляем как fallback, если размеры ещё не доступны.
    if (height.value && width.value) {
      return height.value >= width.value;
    }

    return isPortraitQuery.value;
  });

  return {
    isPortraitMode,
  };
}
