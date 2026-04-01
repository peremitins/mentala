import { defineStore } from 'pinia';
import type { AppNavigationRequest } from '@/shared/navigation';

type PaywallState = {
  open: boolean;
  featureKey: string | null;
  request: AppNavigationRequest | null;
};

export const useAppNavigationStore = defineStore('appNavigation', {
  state: (): PaywallState => ({
    open: false,
    featureKey: null,
    request: null,
  }),

  actions: {
    openPaywall(featureKey: string, request?: AppNavigationRequest | null) {
      this.featureKey = featureKey;
      this.request = request ?? null;
      this.open = true;
    },

    closePaywall() {
      this.open = false;
    },

    clearPaywall() {
      this.open = false;
      this.featureKey = null;
      this.request = null;
    },
  },
});
