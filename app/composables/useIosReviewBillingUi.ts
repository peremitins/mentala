import { Capacitor } from '@capacitor/core';
import { computed } from 'vue';
import { usePlatform } from '@/app/composables/usePlatform';
import { useUserRole } from '@/app/composables/useUserRole';

export function useIosReviewBillingUi() {
  const { platform } = usePlatform();
  const { isSupport } = useUserRole();

  // Единый флаг review-режима: native iOS + support-аккаунт.
  const shouldHideIosReviewBillingUi = computed(() => {
    return (
      platform.value === 'ios' &&
      Capacitor.isNativePlatform() &&
      isSupport.value
    );
  });

  return {
    shouldHideIosReviewBillingUi,
  };
}
