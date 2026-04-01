<template>
  <section class="">
    <div class="flex items-center justify-between gap-3 pt-4 pb-2 px-4">
      <div>
        <p
          class="text-[10px] uppercase tracking-[0.08em] text-foreground/80 leading-snug"
        >
          {{ subtitle }}
        </p>
        <h3 class="text-lg font-semibold text-foreground leading-snug">
          {{ title }} &nbsp;
          <span v-if="emoji" class="mr-2">{{ emoji }}</span>
        </h3>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="text-xs text-foreground/80 hover:text-foreground"
        @click="emit('view-all')"
      >
        Смотреть все
      </Button>
    </div>

    <HorizontalScroller :aria-label="`Лента медитаций раздела ${title}`">
      <template #default>
        <MeditationCard
          v-for="track in tracks"
          :key="track.id"
          :track="track"
          :topic-label="topicLabel(sectionTopicKey ?? track.topicKey)"
          :gradient-class="topicGradient(sectionTopicKey ?? track.topicKey)"
          :active="isActive(track.id)"
          @open="emit('open', $event)"
          @favorite="emit('favorite', $event)"
        />
      </template>
    </HorizontalScroller>
  </section>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import MeditationCard from '@/app/components/meditations/MeditationCard.vue';
import HorizontalScroller from '@/app/components/ui/HorizontalScroller.vue';
import { MEDITATION_TOPICS } from '@/shared/constants/meditations';
import { MEDITATION_TOPIC_GRADIENTS } from '@/app/lib/meditations';
import type {
  MeditationTopicKey,
  MeditationTrackDto,
} from '@/shared/dto/meditations';

const props = defineProps<{
  title: string;
  subtitle?: string;
  emoji?: string;
  tracks: MeditationTrackDto[];
  activeId?: string | null;
  sectionTopicKey?: MeditationTopicKey;
}>();

const emit = defineEmits<{
  (e: 'open', id: string): void;
  (e: 'favorite', id: string): void;
  (e: 'view-all'): void;
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

function isActive(trackId: string) {
  return props.activeId === trackId;
}
</script>
