import { computed, watch } from 'vue';
import { defineNuxtPlugin } from 'nuxt/app';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useSceneAudio } from '@/app/composables/useSceneAudio';

const AUDIO_BLOCKED_ROUTES = [
  '/auth',
  '/error',
  '/forgot',
  '/reset-password',
  '/onboarding',
];

function isAudioBlockedRoute(path: string) {
  if (!path) return false;
  if (path === '/auth/link' || path.startsWith('/auth/link')) return true;
  return AUDIO_BLOCKED_ROUTES.includes(path);
}

export default defineNuxtPlugin({
  name: 'audio-playback-guard',
  dependsOn: ['pinia'],
  setup() {
    if (process.server) return;

    const auth = useAuthStore();
    const route = useRoute();
    const meditationPlayer = useMeditationPlayer();
    const sceneAudio = useSceneAudio();

    const isPlaybackAllowed = computed(() => {
      const path = route.path || '';
      const onboardingCompleted = auth.user?.onboarding?.welcome === true;
      // Пока логин/redirect ещё не завершён или welcome-онбординг не пройден,
      // фоновый звук и медитации запускать нельзя.
      if (!auth.isLoggedIn || auth.isLoggingOut || auth.loading) return false;
      if (!onboardingCompleted) return false;
      if (isAudioBlockedRoute(path)) return false;
      return true;
    });

    const applyPlaybackPolicy = async (allowed: boolean) => {
      // Глобально блокируем любой звук вне основного приложения.
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
