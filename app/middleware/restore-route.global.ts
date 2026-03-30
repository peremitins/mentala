/**
 * Восстанавливает маршрут после возврата из системных настроек.
 * На iOS переход в Настройки может убить WebView — при холодном старте
 * перенаправляем обратно на страницу, с которой пользователь ушёл.
 *
 * Запускается после auth.global.ts (алфавитный порядок: r > a, f).
 */
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'mentai.settings.returnRoute';
const TTL_MS = 2 * 60 * 1000; // 2 минуты — достаточно для возврата из настроек

let _consumed = false;

export default defineNuxtRouteMiddleware(async (to) => {
  if (process.server || _consumed) return;
  _consumed = true;

  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return;

  const { getPersistentItem, removePersistentItem } = await import(
    '@/app/utils/persistentStorage'
  );
  const raw = await getPersistentItem(STORAGE_KEY);
  if (!raw) return;

  // Всегда удаляем ключ, чтобы не зациклить редиректы
  await removePersistentItem(STORAGE_KEY);

  let data: { path: string; ts: number };
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  // Проверяем TTL — если прошло больше 2 минут, игнорируем
  if (Date.now() - data.ts > TTL_MS) return;

  // Не перенаправляем на публичные/служебные маршруты
  const skip = ['/auth', '/onboarding', '/error'];
  if (skip.some((p) => data.path.startsWith(p))) return;

  // Не перенаправляем, если уже на нужной странице
  if (to.path === data.path) return;

  return navigateTo(data.path);
});
