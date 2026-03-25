<template>
  <div
    :class="[
      'min-h-dvh grid place-items-center bg-background/50',
      { 'ios-safe-layout': isIos },
    ]"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useSceneAudio } from '@/app/composables/useSceneAudio';
import { usePlatform } from '@/app/composables/usePlatform';

const sceneAudio = useSceneAudio();
const meditationPlayer = useMeditationPlayer();
const { platform } = usePlatform();
const isIos = computed(() => platform.value === 'ios');

onMounted(async () => {
  // На экранах авторизации звук должен быть выключен полностью.
  await sceneAudio.resetRuntimeState();
  await meditationPlayer.stop(false);
});
</script>
