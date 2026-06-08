<template>
  <div class="space-y-3">
    <!-- Если у action задан helpHint, рендерим prompt + иконку «?» отдельно
         и не передаём prompt в Composer (иначе он отрисует ту же фразу второй
         раз внутри textarea-блока). Это даёт месту для подсказки рядом с
         формулировкой, не ломая базовый Composer. -->
    <div
      v-if="helpHint && prompt"
      class="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3"
    >
      <ProgramFormattedPrompt
        :text="prompt"
        class="flex-1 text-sm leading-relaxed text-foreground/85"
      />
      <ProgramHelpHint
        :title="helpHint.title || null"
        :description="helpHint.description || null"
        :examples="helpHint.examples || null"
        aria-label="Подсказка к заданию"
      />
    </div>

    <div v-if="preparedAnswers?.length" class="flex flex-wrap gap-2">
      <button
        v-for="answer in preparedAnswers"
        :key="answer"
        type="button"
        class="rounded-full border border-white/14 bg-white/6 px-3 py-1.5 text-xs font-medium text-foreground/78 transition hover:border-white/25 active:scale-[0.98]"
        @click="applyPreparedAnswer(answer)"
      >
        {{ answer }}
      </button>
    </div>

    <GratitudeDiaryEmbeddedComposer
      :model-value="modelValue"
      :prompt="helpHint ? null : prompt"
      :placeholder="placeholder"
      :max-length="maxLength"
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

const props = withDefaults(
  defineProps<{
    modelValue: string;
    prompt?: string | null;
    maxLength?: number;
    preparedAnswers?: string[] | null;
    required?: boolean;
    helpHint?: HelpHint | null;
    placeholderText?: string | null;
  }>(),
  {
    prompt: null,
    maxLength: 1200,
    preparedAnswers: null,
    required: true,
    helpHint: null,
    placeholderText: null,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'input-method-change', value: 'text' | 'voice' | 'mixed'): void;
}>();

const { triggerLight } = useHaptics();

function applyPreparedAnswer(answer: string) {
  const nextValue = answer.slice(0, props.maxLength);
  if (nextValue !== props.modelValue) void triggerLight();
  emit('update:modelValue', nextValue);
  emit('input-method-change', 'text');
}

const placeholder = computed(() => {
  // Кастомный placeholder из blueprint (например, с примером ответа) имеет
  // приоритет над дефолтным — позволяет дать конкретный пример прямо в
  // textarea, когда формулировка задания абстрактная.
  if (props.placeholderText && props.placeholderText.trim().length > 0) {
    return props.placeholderText;
  }
  return props.required
    ? 'Запиши коротко: можно одной фразой, голосом или текстом'
    : 'Можно записать мысль или пропустить этот шаг';
});
</script>
