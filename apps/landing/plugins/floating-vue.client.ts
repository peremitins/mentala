import FloatingVue from 'floating-vue';

export default defineNuxtPlugin(() => {
  // Настройки тултипа: не прилипать к краям viewport, отступы.
  const tooltipTheme = FloatingVue.options.themes.tooltip || {};
  FloatingVue.options.themes.tooltip = {
    ...tooltipTheme,
    preventOverflow: true,
    shift: true,
    shiftCrossAxis: true,
    overflowPadding: 12,
  };
});
