<template>
  <div class="space-y-2">
    <p class="text-sm leading-relaxed text-foreground/80">
      {{ label }}
    </p>

    <ProgramRangeScale
      :model-value="modelValue"
      :min="min"
      :max="max"
      :aria-label="label"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ProgramRangeScale from '@/app/components/programs/ProgramRangeScale.vue';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

const props = defineProps<{
  modelValue: number | null;
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const min = computed(() => props.action.scaleMin ?? 0);
const max = computed(() => props.action.scaleMax ?? 10);
const label = computed(
  () =>
    props.action.scaleBeforeLabel ||
    props.action.scaleAfterLabel ||
    props.action.prompt ||
    'Оцени интенсивность тревоги и напряжения'
);
</script>
