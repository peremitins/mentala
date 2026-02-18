import FloatingVue from 'floating-vue';

export default defineNuxtPlugin(() => {
  // Глобально защищаем tooltip от прилипания к краям viewport:
  // floating-ui будет сдвигать popper с горизонтальным отступом.
  const tooltipTheme = FloatingVue.options.themes.tooltip || {};

  FloatingVue.options.themes.tooltip = {
    ...tooltipTheme,
    preventOverflow: true,
    shift: true,
    shiftCrossAxis: true,
    overflowPadding: 12,
  };
});
