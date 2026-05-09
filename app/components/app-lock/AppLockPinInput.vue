<template>
  <div ref="rootElement">
    <InputOTP
      :model-value="modelValue"
      :maxlength="4"
      :disabled="disabled"
      :autofocus="autofocus"
      class="gap-2.5"
      @update:model-value="emit('update:modelValue', $event)"
      @complete="emit('complete', $event)"
    >
      <template #default="{ slots }">
        <InputOTPSlot
          v-for="(slot, index) in slots"
          :key="index"
          v-bind="slot"
          :class="slotClass"
        />
      </template>
    </InputOTP>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { InputOTP, InputOTPSlot } from '@/app/components/ui/shadcn/input-otp';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
    autofocus?: boolean;
  }>(),
  {
    autofocus: true,
  }
);

defineExpose({
  focus,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  complete: [value: string];
}>();

const rootElement = ref<HTMLElement | null>(null);
const slotClass = computed(() => 'h-14 w-12 sm:h-16 sm:w-14');

onMounted(() => {
  if (props.autofocus && !props.disabled) {
    void focus();
  }
});

watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled && props.autofocus) {
      void focus();
    }
  }
);

async function focus() {
  await nextTick();
  requestAnimationFrame(() => {
    const input = rootElement.value?.querySelector('input');
    input?.focus({ preventScroll: true });
  });
}
</script>
