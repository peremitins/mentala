<template>
  <Transition name="fade">
    <div
      v-if="track"
      class="fixed inset-x-0 bottom-25 z-40 px-2"
      role="button"
      tabindex="0"
      @click="emit('open')"
      @keydown.enter.prevent="emit('open')"
    >
      <div class="glass-deep overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="relative h-12 w-12 overflow-hidden rounded-2xl">
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

          <div class="min-w-0 flex-1">
            <p class="text-xs text-white/60">{{ topicLabel(track.topicKey) }}</p>
            <p class="truncate text-sm font-semibold text-white">
              {{ track.title }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-full bg-primary/80 p-3 text-primary-foreground transition hover:bg-primary"
              @click.stop="emit('toggle')"
            >
              <IconPause v-if="isPlaying" class="h-4 w-4" />
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
            class="h-full bg-gradient-to-r from-primary via-cyan-400 to-emerald-400"
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
import type {
  MeditationTopicKey,
  MeditationTrackDto,
} from '@/shared/dto/meditations';

const props = defineProps<{
  track: MeditationTrackDto | null;
  progress: number;
  isPlaying: boolean;
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

function resolveMediaUrl(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
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
