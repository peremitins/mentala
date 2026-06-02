<template>
  <div class="space-y-4">
    <!-- Если у action задан helpHint, оборачиваем вопрос в карточку с
         иконкой «?» — даём расшифровку метода/контекста рядом с вопросом.
         Без helpHint рендерим question обычной фразой над чипами. -->
    <div
      v-if="helpHint && question"
      class="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3"
    >
      <ProgramFormattedPrompt
        :text="question"
        class="flex-1 text-sm leading-relaxed text-foreground/85"
      />
      <ProgramHelpHint
        :title="helpHint.title || null"
        :description="helpHint.description || null"
        :examples="helpHint.examples || null"
        aria-label="Подсказка к вопросу"
      />
    </div>
    <ProgramFormattedPrompt
      v-else-if="question"
      :text="question"
      class="text-sm leading-relaxed text-foreground/80"
    />

    <div class="flex flex-wrap gap-2">
      <button
        v-for="chip in chips"
        :key="chip"
        type="button"
        class="rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-[0.98]"
        :class="
          selectedChips.includes(chip)
            ? 'border-emerald-200/45 bg-emerald-300/18 text-foreground'
            : 'border-white/14 bg-white/6 text-foreground/78 hover:border-white/25'
        "
        @click="toggleChip(chip)"
      >
        {{ chip }}
      </button>
    </div>

    <GratitudeDiaryEmbeddedComposer
      :model-value="modelValue"
      :prompt="null"
      placeholder="Можно добавить пару слов, если варианта не хватает"
      :max-length="500"
      @update:model-value="emit('update:modelValue', $event)"
      @input-method-change="emit('input-method-change', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import GratitudeDiaryEmbeddedComposer from '@/app/components/gratitude-diary/GratitudeDiaryEmbeddedComposer.vue';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';
import ProgramHelpHint from '@/app/components/programs/ProgramHelpHint.vue';

type HelpHint = {
  title?: string | null;
  description?: string | null;
  examples?: string[] | null;
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    selectedChips: string[];
    prompt?: string | null;
    chipQuestion?: string | null;
    chipOptions?: string[] | null;
    chipMode?: 'single' | 'multi' | null;
    helpHint?: HelpHint | null;
  }>(),
  {
    prompt: null,
    chipQuestion: null,
    chipOptions: null,
    chipMode: 'single',
    helpHint: null,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:selectedChips', value: string[]): void;
  (e: 'input-method-change', value: 'text' | 'voice' | 'mixed'): void;
}>();

const question = computed(() => props.chipQuestion || props.prompt || null);
const chips = computed(() => props.chipOptions ?? []);
const exclusiveNoneChips = [
  'Ничего из этого',
  'Пока ничего',
  'Пока не понимаю',
];

function toggleChip(chip: string) {
  if (props.chipMode !== 'multi') {
    emit('update:selectedChips', props.selectedChips[0] === chip ? [] : [chip]);
    return;
  }

  const isExclusiveNone = exclusiveNoneChips.includes(chip);
  const selected = new Set(props.selectedChips);
  if (selected.has(chip)) {
    selected.delete(chip);
  } else {
    if (isExclusiveNone) {
      selected.clear();
    } else {
      for (const noneChip of exclusiveNoneChips) selected.delete(noneChip);
    }
    selected.add(chip);
  }
  emit('update:selectedChips', Array.from(selected));
}
</script>
