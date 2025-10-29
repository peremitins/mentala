<template>
  <div class="expandable-text">
    <div
      ref="textContainer"
      class="relative overflow-hidden transition-all duration-300 ease-in-out"
      :style="containerStyle"
    >
      <p
        :id="id"
        :class="textClass"
        class="text-muted-foreground text-xs leading-relaxed whitespace-pre-line"
        ref="textElement"
        v-html="text"
      />
    </div>

    <button
      v-if="hasOverflow"
      @click="toggleExpanded"
      class="relative mt-1 text-xs text-blue-400 flex items-center gap-1 outline-none rounded-none px-1 py-0.5"
      :aria-expanded="isExpanded"
      :aria-controls="id"
    >
      <IconChevronDown
        :size="12"
        class="transition-transform duration-200"
        :class="{ 'rotate-180': isExpanded }"
      />
      {{ isExpanded ? 'Свернуть' : 'Развернуть' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue';
import IconChevronDown from '~icons/lucide/chevron-down';

interface Props {
  text: string;
  id?: string;
  textClass?: string;
  maxLines?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxLines: 1,
  textClass: '',
});

const isExpanded = ref(false);
const hasOverflow = ref(false);
const textContainer = ref<HTMLElement | null>(null);
const textElement = ref<HTMLElement | null>(null);
const maxHeight = ref(0);
const collapsedHeight = ref(0);

const containerStyle = computed(() => {
  if (!hasOverflow.value) return {};

  return {
    maxHeight: isExpanded.value
      ? `${maxHeight.value}px`
      : `${collapsedHeight.value}px`,
  };
});

async function checkOverflow() {
  if (!textElement.value || typeof document === 'undefined') return;

  await nextTick();

  // Создаем временный элемент для точного измерения
  const tempElement = textElement.value.cloneNode(true) as HTMLElement;
  tempElement.style.position = 'absolute';
  tempElement.style.visibility = 'hidden';
  tempElement.style.height = 'auto';
  tempElement.style.maxHeight = 'none';
  tempElement.style.width = textElement.value.offsetWidth + 'px';

  document.body.appendChild(tempElement);

  // Получаем полную высоту текста
  const fullHeight = tempElement.scrollHeight;
  const lineHeight =
    parseFloat(getComputedStyle(textElement.value).lineHeight) || 16;
  const targetHeight = lineHeight * props.maxLines;

  // Удаляем временный элемент
  document.body.removeChild(tempElement);

  maxHeight.value = fullHeight;
  collapsedHeight.value = targetHeight;

  // Более точная проверка с небольшим запасом
  hasOverflow.value = fullHeight > targetHeight + 2;
}

function toggleExpanded() {
  isExpanded.value = !isExpanded.value;
}

// Проверяем переполнение при изменении текста
watch(
  () => props.text,
  () => {
    nextTick(() => {
      checkOverflow();
    });
  }
);

// Проверяем при изменении размера окна
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    nextTick(() => {
      checkOverflow();
    });
  });
}

// Используем ResizeObserver для более точного отслеживания изменений
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  // Проверяем, что мы в браузере
  if (typeof window === 'undefined') return;

  // Небольшая задержка для полной инициализации DOM
  await nextTick();
  setTimeout(() => {
    checkOverflow();
  }, 100);

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      nextTick(() => {
        checkOverflow();
      });
    });

    if (textContainer.value) {
      resizeObserver.observe(textContainer.value);
    }
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});
</script>

<style scoped>
.expandable-text {
  width: 100%;
}

/* Плавная анимация для высоты */
.transition-all {
  transition-property: max-height, opacity;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
