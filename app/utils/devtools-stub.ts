/**
 * Заглушка для Vue DevTools API на клиенте
 * Предотвращает ошибку "exports is not defined" при использовании CommonJS модулей
 *
 * Эта заглушка заменяет @vue/devtools-api, который использует CommonJS и вызывает ошибки в браузере
 */

export function setupDevtoolsPlugin(
  _pluginDescriptor: unknown,
  _setupFn: (api: unknown) => void
) {
  // Пустая функция-заглушка
  // В продакшене DevTools отключены, поэтому ничего не делаем
}

// Экспортируем как default для совместимости
export default {
  setupDevtoolsPlugin,
};
