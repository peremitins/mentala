<template>
  <div class="flex flex-col gap-3">
    <div class="absolute w-full h-full">
      <video
        ref="videoEl"
        playsinline
        autoplay
        :muted="false"
        :poster="transparentPoster"
        class="h-full w-full !object-contain"
      />
      <audio ref="audioEl" autoplay />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useHeygenStore } from '@/app/stores/heygen';

const videoEl = ref<HTMLVideoElement | null>(null);
const audioEl = ref<HTMLAudioElement | null>(null);

// Прозрачный 1x1 pixel PNG как data URI (убирает placeholder на мобильных)
const transparentPoster =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const heygen = useHeygenStore();

onMounted(() => {
  heygen.setVideoEl(videoEl.value);
  heygen.setAudioEl(audioEl.value);
});
</script>

<style scoped>
video {
  aspect-ratio: 9/16;
  object-fit: cover;
}
</style>
