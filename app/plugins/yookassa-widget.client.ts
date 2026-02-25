import { defineNuxtPlugin } from 'nuxt/app';
import type {
  YooKassaWidgetConstructor,
  YooKassaWidgetInstance,
  YooKassaWidgetOptions,
} from '@/app/types/yookassa-widget';

const YOOKASSA_WIDGET_SCRIPT_SRC =
  'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';

let widgetScriptPromise: Promise<YooKassaWidgetConstructor> | null = null;

function resolveWidgetConstructor(): YooKassaWidgetConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.YooMoneyCheckoutWidget ?? null;
}

async function loadYooKassaWidgetScript(): Promise<YooKassaWidgetConstructor> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('YooKassa widget can be initialized only in browser');
  }

  const constructorFromWindow = resolveWidgetConstructor();
  if (constructorFromWindow) {
    return constructorFromWindow;
  }

  if (!widgetScriptPromise) {
    widgetScriptPromise = new Promise<YooKassaWidgetConstructor>(
      (resolve, reject) => {
        const resolveFromWindowOrReject = () => {
          const constructorFromWindow = resolveWidgetConstructor();
          if (constructorFromWindow) {
            resolve(constructorFromWindow);
            return;
          }
          reject(new Error('YooKassa widget constructor is unavailable'));
        };

        const existingScript = document.querySelector<HTMLScriptElement>(
          'script[data-yookassa-widget="true"]'
        );

        if (existingScript) {
          const handleLoad = () => resolveFromWindowOrReject();
          const handleError = () =>
            reject(new Error('YooKassa widget script failed to load'));

          existingScript.addEventListener('load', handleLoad, { once: true });
          existingScript.addEventListener('error', handleError, {
            once: true,
          });

          // Скрипт мог уже загрузиться до подписки на события (например, при back/forward навигации).
          // В этом случае проверяем конструктор сразу в microtask.
          Promise.resolve().then(() => {
            const constructorFromWindow = resolveWidgetConstructor();
            if (!constructorFromWindow) return;

            existingScript.removeEventListener('load', handleLoad);
            existingScript.removeEventListener('error', handleError);
            resolve(constructorFromWindow);
          });
          return;
        }

        const script = document.createElement('script');
        script.src = YOOKASSA_WIDGET_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.dataset.yookassaWidget = 'true';
        script.onload = () => resolveFromWindowOrReject();
        script.onerror = () =>
          reject(new Error('YooKassa widget script failed to load'));
        document.head.appendChild(script);
      }
    ).catch((error) => {
      // Сбрасываем promise после ошибки, чтобы повторная попытка была возможна.
      widgetScriptPromise = null;
      throw error;
    });
  }

  return await widgetScriptPromise;
}

export default defineNuxtPlugin(() => {
  return {
    provide: {
      yooKassaWidget: {
        ensureLoaded: loadYooKassaWidgetScript,
        async create(
          options: YooKassaWidgetOptions
        ): Promise<YooKassaWidgetInstance> {
          const YooKassaWidget = await loadYooKassaWidgetScript();
          return new YooKassaWidget(options);
        },
      },
    },
  };
});
