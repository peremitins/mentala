import { Capacitor } from '@capacitor/core';
import { computed } from 'vue';
import { usePlatform } from '@/app/composables/usePlatform';

export function useIosReviewBillingUi() {
  const { platform } = usePlatform();

  // Единый флаг скрытия billing UI:
  // в любом native iOS скрываем purchase-management surface.
  const shouldHideIosReviewBillingUi = computed(() => {
    return platform.value === 'ios' && Capacitor.isNativePlatform();
  });

  return {
    shouldHideIosReviewBillingUi,
  };
}
