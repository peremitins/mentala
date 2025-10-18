<template>
  <div class="flex flex-col gap-3">
    <div class="absolute w-full h-full">
      <video
        ref="videoEl"
        playsinline
        autoplay
        :muted="false"
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
