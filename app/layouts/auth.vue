<template>
  <div class="safe-area-top h-dvh overflow-y-auto bg-background/50">
    <div class="min-h-full flex flex-col justify-center items-center">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useSceneAudio } from '@/app/composables/useSceneAudio';

const sceneAudio = useSceneAudio();
const meditationPlayer = useMeditationPlayer();

onMounted(async () => {
  // На экранах авторизации звук должен быть выключен полностью.
  await sceneAudio.resetRuntimeState();
  await meditationPlayer.stop(false);
});
</script>
