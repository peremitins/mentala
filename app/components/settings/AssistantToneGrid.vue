<template>
  <div class="space-y-3">
    <label v-if="label" class="text-sm font-medium text-foreground flex">
      {{ label }}
    </label>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div
        v-for="toneOption in toneOptions"
        :key="toneOption.value"
        :class="getToneCardClasses(toneOption.value)"
      >
        <div class="relative flex items-start justify-between gap-3">
          <button
            type="button"
            :disabled="disabled"
            class="min-w-0 flex-1 text-left"
            @click="handleSelect(toneOption.value)"
          >
            <p class="text-sm font-semibold text-foreground">
              {{ toneOption.label }}
            </p>
          </button>

          <span
            v-tooltip="createToneTooltip(toneOption.description)"
            class="inline-flex h-5 w-5 flex-shrink-0 select-none items-center justify-center text-[11px] font-semibold uppercase leading-none text-foreground/85 transition-colors hover:border-white/35 hover:text-foreground"
            aria-label="Описание стиля"
            role="button"
            tabindex="0"
          >
            <IconInfo class="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>

    <p v-if="description" class="text-xs text-white">
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import {
  ASSISTANT_TONE_META,
  ASSISTANT_TONE_VALUES,
  type AssistantTone,
} from '@/shared/constants/assistantTone';
import IconInfo from '~icons/lucide/info';
import { useHaptics } from '@/app/composables/useHaptics';

interface Props {
  modelValue?: string | null;
  label?: string;
  description?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: null,
  label: '',
  description: '',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: AssistantTone): void;
}>();

const { triggerLight } = useHaptics();

const toneOptions = ASSISTANT_TONE_VALUES.map((value) => ({
  value,
  label: ASSISTANT_TONE_META[value].label,
  description: ASSISTANT_TONE_META[value].description,
}));

function createToneTooltip(content: string) {
  return {
    content,
    triggers: ['hover', 'focus', 'click'],
    placement: 'top',
    distance: 10,
    overflowPadding: 16,
    popperClass: 'landing-tooltip-theme',
  };
}

function isSelected(value: AssistantTone): boolean {
  return props.modelValue === value;
}

function handleSelect(value: AssistantTone) {
  if (props.disabled) return;
  if (!isSelected(value)) {
    void triggerLight();
  }
  emit('update:modelValue', value);
}

function getToneCardClasses(value: AssistantTone): string[] {
  const selected = isSelected(value);

  return [
    'group relative w-full overflow-hidden rounded-2xl border px-4 py-4 transition-all duration-200',
    'disabled:cursor-not-allowed disabled:opacity-60',
    selected
      ? 'border-white/40 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
      : 'border-white/14 bg-background/20 hover:border-white/24 hover:bg-white/[0.05]',
  ];
}
</script>
