/**
 * Composable для открытия изображений в PhotoSwipe с pinch-to-zoom.
 * Используется в Дневнике благодарности и других местах с превью фото.
 *
 * Поддерживает опциональную кнопку скачивания: если у элемента задан
 * `downloadFileName`, в просмотрщике появляется иконка скачивания.
 */
import { useToast } from '@/app/composables/useToast';

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 900;

export interface PhotoSwipeItem {
  src: string;
  width: number;
  height: number;
  alt?: string;
  /**
   * Если задано — в просмотрщике появляется кнопка скачивания, файл
   * сохраняется под этим именем. Используется, например, для итоговой
   * картинки сада в Оранжерее.
   */
  downloadFileName?: string;
}

// Иконка скачивания в стиле остальных кнопок PhotoSwipe: viewBox 0 0 32 32,
// fill-заливка (PhotoSwipe красит через `.pswp__icn { fill }`). Stroke-иконка
// 24x24 смотрелась некруто и не по центру — поэтому делаем родной формат.
const DOWNLOAD_ICON_HTML = `
<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 32 32" width="32" height="32">
  <path d="M16 5a1.5 1.5 0 0 1 1.5 1.5v9.88l3.44-3.44a1.5 1.5 0 1 1 2.12 2.12l-6 6a1.5 1.5 0 0 1-2.12 0l-6-6a1.5 1.5 0 1 1 2.12-2.12l3.44 3.44V6.5A1.5 1.5 0 0 1 16 5z"/>
  <path d="M8 21.5a1.5 1.5 0 0 1 1.5 1.5V24a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5v-1a1.5 1.5 0 0 1 3 0v1a3.5 3.5 0 0 1-3.5 3.5H10A3.5 3.5 0 0 1 6.5 24v-1A1.5 1.5 0 0 1 8 21.5z"/>
</svg>`;

/**
 * Запущены ли мы внутри нативного Capacitor-приложения (iOS/Android app).
 * В нативном WebView атрибут `download` у ссылки игнорируется, поэтому там
 * нужен системный share-лист. В обычном вебе (включая мобильные браузеры)
 * наоборот — надёжнее прямое скачивание.
 */
async function isCapacitorNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Скачивание blob через временную ссылку с атрибутом download.
 * Работает во всех десктоп-браузерах (macOS/Windows/Linux) и в мобильных
 * браузерах (Android Chrome, iOS Safari 13+ для blob/same-origin).
 */
function downloadBlobViaAnchor(blob: Blob, fileName: string): boolean {
  if (typeof document === 'undefined') return false;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Небольшая задержка перед revoke — иначе часть браузеров отменяет загрузку.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return true;
}

/**
 * Кросс-платформенное сохранение изображения без `@capacitor/filesystem`.
 *
 * Стратегия по платформам:
 * - Нативное приложение (Capacitor iOS/Android): системный share-лист через
 *   `navigator.share({ files })` — пользователь сохраняет «В Фото» / «Файлы».
 *   В нативном WebView ссылка с download не качает, поэтому только share.
 * - Любой веб (десктоп macOS/Windows/Linux и мобильные браузеры): прямое
 *   скачивание blob через ссылку. На desktop macOS `navigator.share` с файлами
 *   НЕ работает (показывает меню, но файл в цель не уходит — известное
 *   ограничение платформы), поэтому в вебе его не используем вовсе.
 *
 * Возвращает true, если действие выполнено.
 */
async function saveImage(src: string, fileName: string): Promise<boolean> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить изображение: ${response.status}`);
  }
  const blob = await response.blob();
  const type = blob.type || 'image/png';

  const native = await isCapacitorNative();

  // Нативное приложение: только системный share с файлом.
  if (
    native &&
    typeof navigator !== 'undefined' &&
    typeof File !== 'undefined'
  ) {
    try {
      const file = new File([blob], fileName, { type });
      const canShareFiles =
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });
      if (canShareFiles && typeof navigator.share === 'function') {
        await navigator.share({ files: [file], title: fileName });
        return true;
      }
    } catch (error) {
      // AbortError — пользователь закрыл share-лист, это не ошибка.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return true;
      }
      // Иначе пробуем anchor-fallback ниже.
    }
  }

  // Веб (включая desktop macOS) — настоящее скачивание файла.
  return downloadBlobViaAnchor(blob, fileName);
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
      downloadFileName: item.downloadFileName,
    }));

    const pswp = new PhotoSwipe({
      dataSource,
      index,
      appendToEl: document.body,
      // fade вместо zoom — при программном открытии без thumbnail bounds zoom-анимация может ломать layout
      showHideAnimationType: 'fade',
    });

    // Кнопка скачивания. Регистрируем до init; показываем только на слайдах,
    // у которых задан downloadFileName.
    let isSaving = false;
    pswp.on('uiRegister', () => {
      pswp.ui?.registerElement({
        name: 'download-button',
        order: 8,
        isButton: true,
        tagName: 'button',
        html: DOWNLOAD_ICON_HTML,
        onInit: (el, pswpInstance) => {
          const syncVisibility = () => {
            const slide = pswpInstance.currSlide?.data as
              | { downloadFileName?: string }
              | undefined;
            el.style.display = slide?.downloadFileName ? '' : 'none';
          };
          syncVisibility();
          pswpInstance.on('change', syncVisibility);

          el.setAttribute('aria-label', 'Скачать изображение');
          el.setAttribute('title', 'Скачать');
          el.addEventListener('click', async () => {
            const slide = pswpInstance.currSlide?.data as
              | { src?: string; downloadFileName?: string }
              | undefined;
            if (!slide?.downloadFileName || !slide.src || isSaving) return;
            isSaving = true;
            try {
              await saveImage(slide.src, slide.downloadFileName);
            } catch (error) {
              console.error(
                '[usePhotoSwipe] Не удалось сохранить изображение:',
                error
              );
              useToast(
                'Не удалось сохранить',
                'Попробуй ещё раз чуть позже.',
                'warning'
              );
            } finally {
              isSaving = false;
            }
          });
        },
      });
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
