<template>
  <div class="w-full">
    <label v-if="props.label" :for="props.label">{{ props.label }}</label>
    <div class="flex">
      <textarea
        ref="textarea"
        :id="props.label"
        v-bind="$attrs"
        :class="
          cn(
            'w-full resize-none overflow-y-auto',
            'placeholder:text-muted-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-sm text-sm ',
            props.variant === 'form'
              ? [
                  'rounded-lg border-2 border-border bg-transparent px-3 py-2 text-sm',
                  'ring-offset-background',
                  'focus-visible:outline-none focus:border-primary',
                  'transition-colors',
                ]
              : 'textarea-styled px-3 py-2',
            props.class
          )
        "
        :style="{
          'min-height': minHeight,
          'max-height': maxHeight,
        }"
        :value="displayValue"
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
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import type { Ref } from 'vue';
import { throttle } from 'lodash';
import { isDocumentAvailable } from '@/app/utils/document';
import { cn } from '@/app/lib/utils';

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
  variant?: 'form' | 'chat';
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  disabled: false,
  preventEnterDefault: false,
  maxHeight: '150px',
  variant: 'chat',
});

const emit = defineEmits(['update:modelValue', 'enter-pressed', 'esc-pressed']);

const textarea: Ref<HTMLTextAreaElement | null> = ref(null);

// Нормализуем значение для отображения: null/undefined -> пустая строка
const displayValue = computed(() => {
  return props.modelValue ?? '';
});

// Функция для прокрутки textarea вниз
const scrollToBottom = () => {
  if (textarea.value) {
    nextTick(() => {
      textarea.value!.scrollTop = textarea.value!.scrollHeight;
    });
  }
};

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

  // Handle Enter key
  if (event.key === 'Enter') {
    if (!props.preventEnterDefault) {
      nextTick(() => {
        requestAnimationFrame(() => {
          nextTick(() => {
            adjustHeight();
            scrollToBottom();
          });
        });
      });
      return;
    }
    if (!event.ctrlKey && !event.shiftKey) {
      console.log('Enter key pressed');
      event.preventDefault();
      emit('enter-pressed', event);
    } else if (event.ctrlKey || event.shiftKey) {
      console.log('Ctrl + Enter or Shift + Enter key pressed');
      // Если Ctrl + Enter или Shift + Enter, вставляем перенос строки вручную
      // event.preventDefault();
      // adjustHeight будет вызван через watch на modelValue после обновления значения
      // Но для надежности вызываем дополнительно после небольшой задержки
      nextTick(() => {
        requestAnimationFrame(() => {
          nextTick(() => {
            adjustHeight();
            scrollToBottom();
          });
        });
      });
    }
  } else {
    // Для других клавиш вызываем adjustHeight сразу
    adjustHeight();
  }

  // Handle Escape key
  if (event.key === 'Escape') {
    emit('esc-pressed', event);

    event.preventDefault();

    if (
      isDocumentAvailable() &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
  }
};

const adjustHeight = throttle(() => {
  if (!textarea.value) return;

  // Временно убираем ограничение max-height для правильного вычисления scrollHeight
  // Это важно когда уже есть scrollbar
  const originalMaxHeight = textarea.value.style.maxHeight;
  textarea.value.style.maxHeight = 'none';
  textarea.value.style.height = 'auto';

  const scrollHeight = textarea.value.scrollHeight;

  // Восстанавливаем max-height (CSS сам ограничит если нужно)
  textarea.value.style.maxHeight = originalMaxHeight || props.maxHeight;

  // Устанавливаем высоту - CSS max-height сам ограничит если scrollHeight больше
  textarea.value.style.height = scrollHeight + 2 + 'px';
}, 0);

// Функция для сброса высоты к исходному состоянию
const resetHeight = () => {
  if (textarea.value) {
    // Сбрасываем высоту к auto - она автоматически вернется к минимальной высоте
    textarea.value.style.height = 'auto';
  }
};

// Отслеживаем изменения modelValue для автоматической прокрутки вниз
watch(
  () => props.modelValue,
  (newValue, oldValue) => {
    const newText = String(newValue || '');
    const oldText = String(oldValue || '');

    // Прокручиваем вниз если:
    // 1. Текст увеличился (для голосового ввода)
    // 2. Новый текст начинается со старого (текст добавился в конец)
    if (newText.length > oldText.length && newText.startsWith(oldText)) {
      scrollToBottom();
    }
    adjustHeight();
  }
);

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
  resetHeight,
});

onMounted(() => {
  nextTick(() => {
    handler();
    adjustHeight();
  });
});
</script>

<style scoped>
.textarea-styled {
  /* Базовые стили */
  overflow-y: auto;
  resize: none; /* Отключаем ручное изменение размера */
  border-radius: 15px;

  /* Glassmorphism эффект */
  background: hsl(var(--background) / 0.08);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);

  /* Тени для глубины */
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.1);

  /* Плавные переходы */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* Цвет текста и placeholder */
  color: var(--color-foreground);

  /* Убираем стандартный outline */
  outline: none;
}

.textarea-styled::placeholder {
  color: var(--color-muted-foreground);
  opacity: 0.6;
}

/* Состояние фокуса */
.textarea-styled:focus {
  border-color: hsl(var(--primary) / 0.6);
  /* background: hsl(var(--background) / 0.12); */
  /* box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.15),
    0 0 0 3px hsl(var(--accent) / 0.12),
    0 4px 12px rgba(0, 0, 0, 0.15); */
}

/* Состояние disabled */
.textarea-styled:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: hsl(var(--background) / 0.05);
}
</style>
