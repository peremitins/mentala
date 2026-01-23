import { computed, watch } from 'vue';
import { defineNuxtPlugin } from 'nuxt/app';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useSceneAudio } from '@/app/composables/useSceneAudio';

const PUBLIC_ROUTES = ['/auth', '/error', '/forgot', '/reset-password'];

function isPublicAuthRoute(path: string) {
  if (!path) return false;
  if (path === '/auth/link' || path.startsWith('/auth/link')) return true;
  return PUBLIC_ROUTES.includes(path);
}

export default defineNuxtPlugin({
  name: 'audio-playback-guard',
  dependsOn: ['pinia'],
  setup(nuxtApp) {
    if (process.server) return;

    const auth = useAuthStore(nuxtApp.$pinia);
    const route = useRoute();
    const meditationPlayer = useMeditationPlayer();
    const sceneAudio = useSceneAudio();

    const isPlaybackAllowed = computed(() => {
      const path = route.path || '';
      if (!auth.isLoggedIn || auth.isLoggingOut) return false;
      if (isPublicAuthRoute(path)) return false;
      return true;
    });

    const applyPlaybackPolicy = async (allowed: boolean) => {
      // Глобально блокируем любой звук на публичных маршрутах и при logout.
      await Promise.all([
        meditationPlayer.setPlaybackAllowed(allowed),
        sceneAudio.setPlaybackAllowed(allowed),
      ]);
    };

    watch(
      isPlaybackAllowed,
      (allowed) => {
        void applyPlaybackPolicy(allowed);
      },
      { immediate: true }
    );
  },
});
