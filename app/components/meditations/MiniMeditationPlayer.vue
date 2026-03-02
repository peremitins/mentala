<template>
  <Transition name="fade">
    <div
      v-if="track"
      class="absolute w-full bottom-25 z-40"
      role="button"
      tabindex="0"
      @click="emit('open')"
      @keydown.enter.prevent="emit('open')"
    >
      <div class="glass-deep overflow-hidden">
        <div class="flex min-w-0 items-center gap-3 px-4 py-3">
          <div class="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl">
            <div
              v-if="!track.coverPath"
              class="absolute inset-0 bg-gradient-to-br"
              :class="topicGradient(track.topicKey)"
            />
            <img
              v-else
              :src="resolveMediaUrl(track.coverPath)"
              :alt="track.title"
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>

          <div class="min-w-0 flex-1 overflow-hidden">
            <p class="truncate text-xs text-white/60">
              {{ topicLabel(track.topicKey) }}
            </p>
            <p class="truncate text-sm font-semibold text-white">
              {{ track.title }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-full bg-primary/80 p-3 text-primary-foreground transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
              :disabled="isBuffering"
              :aria-busy="isBuffering"
              @click.stop="emit('toggle')"
            >
              <svg
                v-if="isBuffering"
                class="h-4 w-4 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <IconPause v-else-if="isPlaying" class="h-4 w-4" />
              <IconPlay v-else class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
              @click.stop="emit('stop')"
            >
              <IconX class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div v-if="!track.isLoop" class="h-1 w-full bg-white/10">
          <div
            class="h-full bg-gradient-to-r from-primary-ui via-cyan-400 to-emerald-400"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconX from '~icons/lucide/x';
import { MEDITATION_TOPICS } from '@/shared/constants/meditations';
import { MEDITATION_TOPIC_GRADIENTS } from '@/app/lib/meditations';
import { resolveMediaUrl } from '@/app/utils/media';
import type {
  MeditationTopicKey,
  MeditationTrackDto,
} from '@/shared/dto/meditations';

defineProps<{
  track: MeditationTrackDto | null;
  progress: number;
  isPlaying: boolean;
  isBuffering: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'stop'): void;
  (e: 'open'): void;
}>();

function topicLabel(key: MeditationTopicKey) {
  return MEDITATION_TOPICS.find((t) => t.key === key)?.name || 'Тема';
}

function topicGradient(key: MeditationTopicKey) {
  return (
    MEDITATION_TOPIC_GRADIENTS[key] ||
    'from-slate-500 via-indigo-500 to-blue-600'
  );
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
