export const focus = {
  mounted(el: HTMLElement) {
    if (typeof el.focus === 'function') {
      if (el.tabIndex >= 0 || el.hasAttribute('tabindex')) {
        setTimeout(() => {
          el.focus();
        });
      } else {
        console.warn(
          'Element is not focusable. Add "tabindex" attribute to make it focusable.'
        );
      }
    } else {
      console.warn('Element does not support the "focus" method.');
    }
  },
};
