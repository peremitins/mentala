<template>
  <section
    class="glass-deep flex items-start gap-3 p-4 animate-slide-up"
    role="button"
    tabindex="0"
    @click="expanded = !expanded"
    @keydown.enter.prevent="expanded = !expanded"
    @keydown.space.prevent="expanded = !expanded"
  >
    <div
      class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-300/15 text-emerald-100"
      aria-hidden="true"
    >
      <IconSparkles class="h-4 w-4" />
    </div>

    <div class="min-w-0 flex-1 space-y-1">
      <p
        class="text-[10px] font-semibold uppercase tracking-wide text-emerald-200"
      >
        Мысль дня
      </p>
      <p
        class="text-sm leading-relaxed text-foreground/85"
        :class="{ 'line-clamp-2': !expanded }"
      >
        {{ props.thought.text }}
      </p>
      <div v-if="expanded" class="flex flex-wrap items-center gap-2 pt-2">
        <NuxtLink
          to="/thoughts"
          class="inline-flex min-h-8 items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-foreground/75 transition hover:bg-white/10"
          @click.stop
        >
          Коллекция мыслей
        </NuxtLink>
      </div>
    </div>

    <button
      type="button"
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/65 transition hover:bg-white/10 hover:text-foreground"
      :disabled="saving"
      :aria-label="saved ? 'Мысль сохранена' : 'Сохранить мысль'"
      :aria-busy="saving"
      @click.stop="toggleSaved"
    >
      <IconLoader v-if="saving" class="h-5 w-5 animate-spin" />
      <IconBookmarkCheck v-else-if="saved" class="h-5 w-5 text-emerald-200" />
      <IconBookmark v-else class="h-5 w-5" />
    </button>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import IconBookmark from '~icons/lucide/bookmark';
import IconBookmarkCheck from '~icons/lucide/bookmark-check';
import IconLoader from '~icons/lucide/loader-2';
import IconSparkles from '~icons/lucide/sparkles';
import { useAPI } from '@/app/composables/useAPI';
import type {
  ThoughtOfTheDayDto,
  ThoughtOfTheDaySaveResponseDto,
} from '@/shared/dto/retention';

const props = defineProps<{
  thought: ThoughtOfTheDayDto;
}>();

const emit = defineEmits<{
  (event: 'saved-change', payload: ThoughtOfTheDaySaveResponseDto): void;
}>();

const expanded = ref(false);
const saved = ref(props.thought.saved);
const saving = ref(false);

async function toggleSaved() {
  if (saving.value) return;
  saving.value = true;

  try {
    const response = await useAPI<ThoughtOfTheDaySaveResponseDto>(
      '/api/thought-of-the-day/save',
      {
        method: saved.value ? 'DELETE' : 'POST',
        body: props.thought.id ? { id: props.thought.id } : {},
        suppressErrorToast: true,
      }
    );
    saved.value = response.item.saved;
    emit('saved-change', response);
  } catch (error) {
    console.error('[HomeThoughtCard] Не удалось обновить мысль дня:', error);
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.thought.saved,
  (value) => {
    saved.value = value;
  }
);
</script>
