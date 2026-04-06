import { defineNuxtPlugin } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';
import { useUpdatePolicy } from '@/app/composables/useUpdatePolicy';

export default defineNuxtPlugin(() => {
  if (process.server) return;

  // Update policy проверяется только на нативных платформах
  if (!Capacitor.isNativePlatform()) return;

  const { checkUpdatePolicy, loadCachedPolicy } = useUpdatePolicy();

  // Сразу загружаем кэш — если blocker был, показываем немедленно
  void loadCachedPolicy();

  // Затем проверяем актуальную policy с сервера
  void checkUpdatePolicy();

  // Проверка при возврате из фона
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void checkUpdatePolicy();
        }
      });
    })
    .catch((error) => {
      console.warn(
        '[Update Check] Failed to setup appStateChange listener:',
        error
      );
    });
});
