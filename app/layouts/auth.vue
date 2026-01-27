<template>
  <div class="min-h-dvh grid place-items-center bg-background/50">
    <slot />
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
  await sceneAudio.stop(false);
  await meditationPlayer.stop(false);
});
</script>
