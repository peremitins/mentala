import type { FetchOptions } from 'ofetch';

declare module 'nuxt/app' {
  interface NuxtApp {
    $api: <T = any>(url: string, options?: FetchOptions) => Promise<T>;
  }
}

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $api: import('nuxt/app').NuxtApp['$api'];
  }
}
