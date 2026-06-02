<template>
  <span
    v-tooltip="tooltip"
    :aria-label="ariaLabel || 'Подробнее'"
    class="mt-[1px] inline-flex h-5 w-5 flex-shrink-0 select-none items-center justify-center rounded-full border border-white/25 bg-black/30 text-[11px] font-semibold leading-none text-foreground/90 transition active:scale-90 hover:bg-black/40"
    role="button"
    tabindex="0"
  >
    ?
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title?: string | null;
    description?: string | null;
    examples?: string[] | null;
    ariaLabel?: string | null;
    side?: 'top' | 'right' | 'bottom' | 'left';
  }>(),
  {
    title: null,
    description: null,
    examples: null,
    ariaLabel: null,
    side: 'top',
  }
);

/**
 * Экранируем строку перед вставкой в HTML-content тултипа. Контент идёт
 * из blueprint программы (не от пользователя), но привычка экранировать
 * любые динамические строки в HTML — самая дешёвая защита от случайной
 * подстановки опасного фрагмента в будущем.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const tooltipHtml = computed(() => {
  const parts: string[] = [];
  if (props.title) {
    parts.push(
      `<p style="margin:0 0 6px;font-weight:600">${escapeHtml(props.title)}</p>`
    );
  }
  if (props.description) {
    parts.push(
      `<p style="margin:0;white-space:pre-line">${escapeHtml(
        props.description
      )}</p>`
    );
  }
  if (props.examples && props.examples.length > 0) {
    const items = props.examples
      .map(
        (example) =>
          `<li style="margin:4px 0 0;padding-left:12px;text-indent:-10px">· ${escapeHtml(
            example
          )}</li>`
      )
      .join('');
    parts.push(
      `<ul style="margin:8px 0 0;padding:0;list-style:none">${items}</ul>`
    );
  }
  // Оборачиваем контент в скроллируемый блок: на маленьких экранах
  // длинные description + examples не помещаются в тултип и раньше просто
  // обрезались внизу. Теперь даём вертикальный скролл с лимитом по высоте
  // вьюпорта (минус ~140px на отступы сверху/снизу и трей-якорь).
  // overscroll-behavior:contain — чтобы скролл внутри тултипа не вытягивал
  // под собой страницу при достижении границы.
  return `<div style="max-height:min(60dvh,calc(100dvh - 140px));overflow-y:auto;overscroll-behavior:contain;padding-right:2px">${parts.join('')}</div>`;
});

/**
 * Конфигурация v-tooltip из floating-vue. Используем тот же `popperClass`
 * и набор triggers, что на тарифной карточке, — это даёт единый стиль
 * (см. `.plan-feature-tooltip` в app/assets/css/main.scss) и одинаковое
 * поведение по hover/click/focus на десктопе и тапу на мобильных.
 */
const tooltip = computed(() => ({
  content: tooltipHtml.value,
  html: true,
  triggers: ['hover', 'focus', 'click'],
  placement: props.side,
  distance: 8,
  overflowPadding: 16,
  popperClass: 'plan-feature-tooltip',
}));
</script>
