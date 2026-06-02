<template>
  <article
    role="button"
    tabindex="0"
    :aria-label="`Открыть медитацию ${displayTitle}`"
    class="group relative flex w-[78vw] min-w-[210px] max-w-[240px] sm:w-52 cursor-inherit flex-col overflow-hidden rounded-xl text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ui/60"
    @click="emit('open', track.id)"
    @keydown="handleCardKeydown"
  >
    <img
      v-if="track.coverPath"
      :src="coverUrl"
      :alt="displayTitle"
      class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      loading="lazy"
      decoding="async"
    />
    <div
      v-else
      class="absolute inset-0 bg-gradient-to-br"
      :class="gradientClass"
    />
    <div
      class="absolute inset-0 bg-gradient-to-t from-black/55 via-black/35 to-black/5"
    />
    <div
      v-if="locked"
      class="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm leading-none text-white"
    >
      <span aria-hidden="true">{{ planBadge }}</span>
    </div>

    <div class="relative z-10 flex h-full flex-col p-3 min-h-[120px]">
      <div class="flex items-start justify-between">
        <div class="min-w-0 flex-1 space-y-1 pr-10">
          <p
            class="text-[11px] uppercase tracking-[0.08em] text-foreground/80 drop-shadow"
          >
            {{ topicLabel }}
          </p>
          <h4
            class="line-clamp-2 text-md font-semibold text-white leading-snug drop-shadow-md"
          >
            {{ displayTitle }}
          </h4>
          <!-- <p class="line-clamp-2 text-sm text-foreground/80 drop-shadow mb-2">
            {{ track.description || 'Мягкий фон для короткой паузы' }}
          </p> -->
        </div>
        <button
          type="button"
          data-no-drag-scroll
          class="absolute bottom-2 right-2 z-20 rounded-full bg-black/55 p-2 text-white transition hover:bg-black/70"
          :aria-label="`Добавить ${displayTitle} в избранное`"
          @click.stop="handleFavoriteClick"
        >
          <IconHeart
            class="h-4 w-4"
            :class="
              track?.isFavorite
                ? 'text-red-500 [&>path]:fill-current [&>path]:stroke-current'
                : ' [&>path]:fill-none [&>path]:stroke-current'
            "
          />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-[11px] mt-auto">
        <Badge
          v-if="!track.isLoop"
          variant="secondary"
          class="bg-white/10 text-white/80"
        >
          {{ formatDuration(track.durationSeconds) }}
        </Badge>
      </div>
    </div>

    <div v-if="active" class="absolute inset-0 z-0 bg-black/25">
      <div class="absolute inset-0 flex items-center justify-center">
        <div
          class="h-3 w-3 rounded-full bg-primary-ui shadow-[0_0_18px_rgba(56,189,248,0.9)] animate-pulse"
        />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconHeart from '~icons/lucide/heart';
import { formatInTimeZone } from 'date-fns-tz';
import { Badge } from '@/app/components/ui/shadcn/badge';
import { resolveMediaUrl } from '@/app/utils/media';
import type { MeditationTrackDto } from '@/shared/dto/meditations';

const props = defineProps<{
  track: MeditationTrackDto;
  topicLabel: string;
  gradientClass: string;
  active?: boolean;
  locked?: boolean;
  requiredPlan?: 'pro' | 'premium' | null;
}>();

const emit = defineEmits<{
  (e: 'open', id: string): void;
  (e: 'favorite', id: string): void;
  (e: 'locked-action'): void;
}>();

const coverUrl = computed(() => {
  return resolveMediaUrl(props.track.coverPath || '');
});

const displayTitle = computed(() => {
  const normalizedTitle = props.track.title?.trim();
  return normalizedTitle || 'Без названия';
});

const planBadge = computed(() => {
  return props.requiredPlan === 'premium' ? '💎' : '⭐';
});

function handleCardKeydown(event: KeyboardEvent) {
  // Поддерживаем доступность карточки при управлении с клавиатуры.
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  emit('open', props.track.id);
}

function handleFavoriteClick() {
  if (props.locked) {
    emit('locked-action');
    return;
  }
  emit('favorite', props.track.id);
}

function formatDuration(durationSeconds?: number | null) {
  if (!durationSeconds) return '∞';
  const safeSeconds = Math.max(0, Math.floor(durationSeconds));
  const formatMask = safeSeconds >= 3600 ? 'H:mm:ss' : 'mm:ss';
  // Форматируем в UTC, чтобы не зависеть от часового пояса устройства.
  return formatInTimeZone(new Date(safeSeconds * 1000), 'UTC', formatMask);
}
</script>
