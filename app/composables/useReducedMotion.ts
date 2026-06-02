import { useMediaQuery } from '@vueuse/core';
import type { Ref } from 'vue';

/**
 * Единый источник правды по `prefers-reduced-motion: reduce`.
 *
 * Использовать вместо локального `window.matchMedia('(prefers-reduced-motion: reduce)')`
 * или `useMediaQuery(...)` напрямую: чтобы при добавлении ручного override
 * (например, тогл «убавить анимации» в настройках) поменять реакцию во всём
 * приложении в одном месте.
 *
 * SSR-safe: VueUse возвращает `false` на сервере.
 */
export function useReducedMotion(): Ref<boolean> {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
