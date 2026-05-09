<template>
  <OTPInput
    :model-value="props.modelValue"
    :maxlength="props.maxlength"
    :disabled="props.disabled"
    :autofocus="props.autofocus"
    :container-class="cn('group flex items-center justify-center', props.class)"
    inputmode="numeric"
    pattern="\d*"
    autocomplete="one-time-code"
    :paste-transformer="pasteTransformer"
    @update:model-value="emit('update:modelValue', normalizeOtpValue($event))"
    @complete="emit('complete', normalizeOtpValue($event))"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </OTPInput>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { OTPInput } from 'vue-input-otp';
import { cn } from '@/app/lib/utils';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    maxlength?: number;
    disabled?: boolean;
    autofocus?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  {
    modelValue: '',
    maxlength: 4,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  complete: [value: string];
}>();

function normalizeOtpValue(value: string | undefined): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, props.maxlength);
}

function pasteTransformer(value: string | undefined): string {
  return normalizeOtpValue(value);
}
</script>
