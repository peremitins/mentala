<template>
  <div class="space-y-4">
    <ProgramFormattedPrompt
      v-if="prompt"
      :text="prompt"
      class="text-sm leading-relaxed text-foreground/75"
    />

    <div class="flex flex-wrap gap-2">
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-all duration-200 active:scale-[0.98]"
        :class="
          selectedChipId === chip.id
            ? 'border-primary-ui bg-primary-ui/20 text-foreground shadow-sm'
            : 'border-white/14 bg-white/6 text-foreground/78 hover:border-white/25'
        "
        @click="insertChip(chip)"
      >
        {{ chip.chipText }}
      </button>
    </div>

    <GratitudeDiaryEmbeddedComposer
      :model-value="modelValue"
      :prompt="null"
      :placeholder="currentPlaceholder"
      :max-length="maxLength"
      @update:model-value="emit('update:modelValue', $event)"
      @input-method-change="emit('input-method-change', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import GratitudeDiaryEmbeddedComposer from '@/app/components/gratitude-diary/GratitudeDiaryEmbeddedComposer.vue';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    prompt?: string | null;
    maxLength?: number;
  }>(),
  {
    prompt: null,
    maxLength: 2000,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'input-method-change', value: 'text' | 'voice' | 'mixed'): void;
}>();

const chips = [
  {
    id: 'anxious',
    chipText: 'Меня тревожит, что...',
    textareaText: 'Меня тревожит, что',
  },
  {
    id: 'angry',
    chipText: 'Я злюсь, потому что...',
    textareaText: 'Я злюсь, потому что',
  },
  {
    id: 'scared',
    chipText: 'Мне страшно, что...',
    textareaText: 'Мне страшно, что',
  },
  {
    id: 'ruminating',
    chipText: 'Я не могу перестать думать о...',
    textareaText: 'Я не могу перестать думать о',
  },
  {
    id: 'need',
    chipText: 'Мне сейчас нужно...',
    textareaText: 'Мне сейчас нужно',
  },
  {
    id: 'feel',
    chipText: 'Я чувствую...',
    textareaText: 'Я чувствую',
  },
] as const;

type ThoughtDumpChip = (typeof chips)[number];
type ThoughtDumpChipId = ThoughtDumpChip['id'];

const selectedChipId = ref<ThoughtDumpChipId | null>(null);
const selectedChip = computed(() => {
  if (!selectedChipId.value) return null;
  return chips.find((chip) => chip.id === selectedChipId.value) || null;
});
const currentPlaceholder = computed(() =>
  selectedChip.value
    ? `Продолжи мысль: «${selectedChip.value.chipText}»`
    : 'Начни с одной фразы. Например: «Меня тревожит...»'
);

function insertChip(chip: ThoughtDumpChip) {
  let continuation = props.modelValue;

  if (selectedChip.value) {
    const previousPrefix = `${selectedChip.value.textareaText} `;
    if (continuation.startsWith(previousPrefix)) {
      continuation = continuation.slice(previousPrefix.length);
    }
  }

  continuation = continuation.trimStart();
  selectedChipId.value = chip.id;

  const nextValue = continuation
    ? `${chip.textareaText} ${continuation}`
    : `${chip.textareaText} `;
  emit('update:modelValue', nextValue.slice(0, props.maxLength));
  emit('input-method-change', 'text');
}
</script>
