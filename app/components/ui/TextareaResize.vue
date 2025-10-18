<template>
  <div class="w-full">
    <label v-if="props.label" :for="props.label">{{ props.label }}</label>
    <div class="">
      <textarea
        ref="textarea"
        :id="props.label"
        v-bind="$attrs"
        class="w-full px-3 py-2"
        :style="{
          'min-height': minHeight,
          'max-height': maxHeight,
          'border-radius': 'calc(var(--radius-sm))',
        }"
        :value="modelValue"
        @input="handler"
        @keydown="handleKeydown"
        :lang="'ru-RU'"
        spellcheck="true"
        :disabled="props.disabled"
        :placeholder="placeholder"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import type { Ref } from 'vue';

import { throttle } from 'lodash';

interface Props {
  maxHeight?: string;
  minHeight?: string;
  modelValue: any;
  resize?: string | boolean;
  placeholder?: string;
  isShown?: boolean;
  label?: string;
  disabled?: boolean;
  preventEnterDefault?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  disabled: false,
  preventEnterDefault: false,
  maxHeight: '150px',
});

const emit = defineEmits(['update:modelValue', 'enter-pressed', 'esc-pressed']);

const textarea: Ref<HTMLTextAreaElement | null> = ref(null);

const handler = (e: Event | null = null) => {
  if (e) {
    const target = e.target as HTMLInputElement;

    const value = target.value;
    // Если значение пустое, эмитим null, иначе само значение. Для того, чтобы валидация работала корректно
    emit('update:modelValue', value === '' ? null : value);
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  const el = textarea.value;
  if (!el) return;

  adjustHeight();

  // Handle Enter key
  if (event.key === 'Enter') {
    if (!event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      emit('enter-pressed', event);
    } else if (event.ctrlKey || event.shiftKey) {
      // Если Ctrl + Enter или Shift + Enter, вставляем перенос строки вручную
      // event.preventDefault();
    }
  }

  // Handle Escape key
  if (event.key === 'Escape') {
    emit('esc-pressed', event);

    event.preventDefault();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
};

const adjustHeight = throttle(() => {
  if (textarea.value) {
    textarea.value.style.height = 'auto';
    textarea.value.style.height = textarea.value.scrollHeight + 'px';
  }
}, 300);

watch(
  () => props.isShown,
  () => {
    // подстраиваем высоту textarea при показе
    nextTick(() => {
      if (!props.preventEnterDefault) {
        adjustHeight();
      }
    });
  }
);

defineExpose({
  textarea,
});

onMounted(() => {
  nextTick(() => {
    handler();
  });

  if (!props.preventEnterDefault) {
    adjustHeight();
  }

  window.addEventListener('resize', adjustHeight);
});

onUnmounted(() => {
  window.removeEventListener('resize', adjustHeight);
});
</script>
