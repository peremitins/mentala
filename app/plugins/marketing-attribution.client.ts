import { defineNuxtPlugin } from 'nuxt/app';
import { watch } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import { useMarketingAttribution } from '@/app/composables/useMarketingAttribution';

export default defineNuxtPlugin({
  name: 'marketing-attribution',
  dependsOn: ['pinia'],
  setup() {
    const auth = useAuthStore();
    const route = useRoute();
    const { captureFromCurrentRoute, submitAuthenticatedMarketingTouchOnce } =
      useMarketingAttribution();

    const syncMarketingAttribution = async () => {
      captureFromCurrentRoute();

      if (auth.user?.id) {
        await submitAuthenticatedMarketingTouchOnce();
      }
    };

    watch(
      () => route.fullPath,
      () => {
        void syncMarketingAttribution();
      },
      { immediate: true }
    );

    watch(
      () => auth.user?.id,
      (userId) => {
        if (userId) {
          void syncMarketingAttribution();
        }
      }
    );
  },
});
