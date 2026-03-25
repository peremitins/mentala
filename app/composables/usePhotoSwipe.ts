/**
 * Composable для открытия изображений в PhotoSwipe с pinch-to-zoom.
 * Используется в Дневнике благодарности и других местах с превью фото.
 */
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 900;

export interface PhotoSwipeItem {
  src: string;
  width: number;
  height: number;
  alt?: string;
}

export function usePhotoSwipe() {
  /** Открывает PhotoSwipe с одним или несколькими изображениями */
  async function openPhotoSwipe(
    items: PhotoSwipeItem[],
    options?: { index?: number }
  ) {
    if (!items.length || typeof window === 'undefined') return;

    const { default: PhotoSwipe } = await import('photoswipe');

    const index = options?.index ?? 0;
    const dataSource = items.map((item) => ({
      src: item.src,
      width: item.width || DEFAULT_WIDTH,
      height: item.height || DEFAULT_HEIGHT,
      alt: item.alt,
    }));

    const pswp = new PhotoSwipe({
      dataSource,
      index,
      appendToEl: document.body,
      // fade вместо zoom — при программном открытии без thumbnail bounds zoom-анимация может ломать layout
      showHideAnimationType: 'fade',
    });

    pswp.init();
  }

  /**
   * Обработчик клика по img — открывает PhotoSwipe.
   * Использовать: @click="(e) => openPhotoSwipeFromImg(e)"
   */
  function openPhotoSwipeFromImg(event: MouseEvent) {
    const img = event.target as HTMLImageElement;
    if (!img || img.tagName !== 'IMG') return;

    const src = img.currentSrc || img.src;
    if (!src) return;

    const width = img.naturalWidth || DEFAULT_WIDTH;
    const height = img.naturalHeight || DEFAULT_HEIGHT;

    openPhotoSwipe([{ src, width, height, alt: img.alt }]);
  }

  return {
    openPhotoSwipe,
    openPhotoSwipeFromImg,
  };
}
