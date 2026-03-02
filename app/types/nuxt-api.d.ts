import type { FetchOptions } from 'ofetch';
import type {
  YooKassaWidgetConstructor,
  YooKassaWidgetInstance,
  YooKassaWidgetOptions,
} from '@/app/types/yookassa-widget';

declare module 'nuxt/app' {
  interface NuxtApp {
    $api: <T = any>(url: string, options?: FetchOptions) => Promise<T>;
    $yooKassaWidget: {
      ensureLoaded: () => Promise<YooKassaWidgetConstructor>;
      create: (
        options: YooKassaWidgetOptions
      ) => Promise<YooKassaWidgetInstance>;
    };
  }
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $api: import('nuxt/app').NuxtApp['$api'];
    $yooKassaWidget: import('nuxt/app').NuxtApp['$yooKassaWidget'];
  }
}
