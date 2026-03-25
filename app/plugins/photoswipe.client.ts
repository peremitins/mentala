// Подключаем стили PhotoSwipe для просмотра фото в Дневнике благодарности.
// Core загружается динамически в usePhotoSwipe при первом открытии.
import 'photoswipe/style.css';

// Фикс: z-index выше всех оверлеев приложения (модалки, BottomNav и т.д.).
// Дефолтный --pswp-root-z-index: 100000 может конфликтовать с Radix/другими слоями.
export default defineNuxtPlugin(() => {
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.setAttribute('data-photoswipe-fix', '');
  style.textContent = `
    .pswp {
      --pswp-root-z-index: 999999 !important;
      z-index: 999999 !important;
    }
  `;
  document.head.appendChild(style);
});
