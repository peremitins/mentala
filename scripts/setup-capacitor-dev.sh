#!/bin/bash
# Скрипт для настройки Capacitor для разработки
# Использование:
#   ./scripts/setup-capacitor-dev.sh emulator    - для эмулятора
#   ./scripts/setup-capacitor-dev.sh device      - для реального устройства
#   ./scripts/setup-capacitor-dev.sh            - без dev-сервера (production build)

DEVICE_TYPE=${1:-none}

if [ "$DEVICE_TYPE" = "emulator" ]; then
  # Для эмулятора используем специальный IP
  SERVER_URL="http://10.0.2.2:3000"
  echo "🔧 Настройка для эмулятора: $SERVER_URL"
elif [ "$DEVICE_TYPE" = "device" ]; then
  # Для реального устройства получаем локальный IP (для macOS)
  LOCAL_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
  
  if [ -z "$LOCAL_IP" ]; then
    echo "❌ Не удалось определить локальный IP автоматически"
    echo "   Убедись, что компьютер подключен к сети"
    echo "   Или укажи IP вручную, изменив скрипт"
    exit 1
  fi
  
  # Для реального устройства используем локальный IP
  SERVER_URL="http://${LOCAL_IP}:3000"
  echo "🔧 Настройка для реального устройства: $SERVER_URL"
  echo "   Убедись, что dev-сервер запущен: pnpm dev"
else
  # Production - без dev-сервера
  SERVER_URL=""
  echo "🔧 Настройка для production (без dev-сервера)"
fi

# Экспортируем переменную для cap sync
export CAPACITOR_SERVER_URL="$SERVER_URL"

# Выполняем синхронизацию
if [ -n "$SERVER_URL" ]; then
  echo "📦 Синхронизация с dev-сервером..."
  npx cap sync && CAPACITOR_SERVER_URL="$SERVER_URL" node scripts/fix-capacitor-config.js
else
  echo "📦 Синхронизация со статическими файлами..."
  pnpm run generate
  npx cap sync && CAPACITOR_SERVER_URL="" node scripts/fix-capacitor-config.js
fi

echo "✅ Готово! Теперь можно запускать приложение."
if [ -n "$SERVER_URL" ]; then
  echo "⚠️  Не забудь запустить dev-сервер: pnpm dev"
fi
