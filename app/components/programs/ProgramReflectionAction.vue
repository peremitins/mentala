<template>
  <div class="space-y-4">
    <!-- Если у action задан helpHint, оборачиваем prompt в карточку с иконкой «?»,
         чтобы у пользователя был контекст метода рядом с вопросом. Для финальной
         reflection «Как прошло?» prompt не передаётся — блок не рендерится. -->
    <div
      v-if="helpHint && props.prompt"
      class="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3"
    >
      <ProgramFormattedPrompt
        :text="props.prompt"
        class="flex-1 text-sm leading-relaxed text-foreground/85"
      />
      <ProgramHelpHint
        :title="helpHint.title || null"
        :description="helpHint.description || null"
        :examples="helpHint.examples || null"
        aria-label="Подсказка к разбору"
      />
    </div>
    <ProgramFormattedPrompt
      v-else-if="props.prompt"
      :text="props.prompt"
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
      placeholder="Можно добавить пару слов голосом или текстом"
      :max-length="800"
      @update:model-value="emit('update:modelValue', $event)"
      @input-method-change="emit('input-method-change', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import GratitudeDiaryEmbeddedComposer from '@/app/components/gratitude-diary/GratitudeDiaryEmbeddedComposer.vue';
import { useHaptics } from '@/app/composables/useHaptics';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';
import ProgramHelpHint from '@/app/components/programs/ProgramHelpHint.vue';

type HelpHint = {
  title?: string | null;
  description?: string | null;
  examples?: string[] | null;
};

const props = defineProps<{
  modelValue: string;
  selectedChips: string[];
  /** CBT-вопрос для primary reflection. Не задан — блок не рендерится. */
  prompt?: string | null;
  /**
   * Кастомные chip-варианты (например, для primary CBT-вопроса:
   * «Тревога», «Усталость», ...). Если не заданы — fallback на generic
   * варианты «Стало спокойнее / ...» для финальной reflection «Как прошло?».
   */
  chipOptions?: string[] | null;
  /**
   * Подсказка-тултип с расшифровкой метода рядом с вопросом. Не задана —
   * показываем prompt как обычный текст без иконки «?».
   */
  helpHint?: HelpHint | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:selectedChips', value: string[]): void;
  (e: 'input-method-change', value: 'text' | 'voice' | 'mixed'): void;
}>();

const { triggerLight } = useHaptics();

const GENERIC_CHIPS = [
  'Стало спокойнее',
  'Чуть легче',
  'Пока без изменений',
  'Не помогло',
  'Хочу повторить',
  'Хочу другую практику',
] as const;

const chips = computed<readonly string[]>(() => {
  const custom = props.chipOptions;
  if (Array.isArray(custom) && custom.length > 0) return custom;
  return GENERIC_CHIPS;
});

function toggleChip(chip: string) {
  const selected = new Set(props.selectedChips);
  if (selected.has(chip)) {
    selected.delete(chip);
  } else {
    selected.add(chip);
  }
  void triggerLight();
  emit('update:selectedChips', Array.from(selected));
}
</script>
