#!/bin/bash
# Скрипт для настройки Capacitor для разработки
# Использование:
#   ./scripts/setup-capacitor-dev.sh emulator      - live reload для эмулятора
#   ./scripts/setup-capacitor-dev.sh device        - локальный bundle для реального устройства
#   ./scripts/setup-capacitor-dev.sh device-live   - live reload: Android через localhost+adb reverse, iOS через LAN-IP
#   ./scripts/setup-capacitor-dev.sh               - production build без dev-сервера

DEVICE_TYPE=${1:-none}
IOS_PROJECT_FILE="ios/App/App.xcodeproj/project.pbxproj"
DEV_PORT="${CAP_DEV_PORT:-3000}"
SERVER_URL=""
SERVER_URL_ANDROID=""
SERVER_URL_IOS=""
API_BASE_URL=""
USE_LOCAL_BUNDLE=false
USE_PLATFORM_LIVE_RELOAD=false

ensure_ios_project_object_version_compatible() {
  if [ ! -f "$IOS_PROJECT_FILE" ]; then
    return
  fi

  # CocoaPods 1.16.2 (xcodeproj 1.27.0) не умеет objectVersion = 70.
  # Для стабильного pod install держим совместимую версию проекта.
  if grep -q "objectVersion = 70;" "$IOS_PROJECT_FILE"; then
    echo "🔧 Исправление iOS project format для CocoaPods: 70 -> 77"
    perl -0pi -e 's/objectVersion = 70;/objectVersion = 77;/' "$IOS_PROJECT_FILE"
  fi
}

ensure_android_reverse_port_forwarding() {
  local port="$1"

  if ! command -v adb >/dev/null 2>&1; then
    return
  fi

  local devices=()
  while IFS= read -r device_id; do
    if [ -n "$device_id" ]; then
      devices+=("$device_id")
    fi
  done < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')

  if [ "${#devices[@]}" -eq 0 ]; then
    return
  fi

  echo "🔌 Настройка adb reverse для Android live reload (${port} -> ${port})"
  for device_id in "${devices[@]}"; do
    adb -s "$device_id" reverse "tcp:${port}" "tcp:${port}" >/dev/null
    echo "   • ${device_id}: localhost:${port} -> host:${port}"
  done
}

if [ "$DEVICE_TYPE" = "emulator" ]; then
  # Для эмулятора используем специальный IP
  SERVER_URL="http://10.0.2.2:${DEV_PORT}"
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
  
  API_BASE_URL="http://${LOCAL_IP}:${DEV_PORT}"
  USE_LOCAL_BUNDLE=true
  echo "🔧 Настройка для реального устройства: локальный bundle + API ${API_BASE_URL}"
  echo "   Realtime voice требует localhost-origin, поэтому server.url не используется"
  echo "   Убедись, что dev-сервер запущен: pnpm dev"
elif [ "$DEVICE_TYPE" = "device-live" ]; then
  LOCAL_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)

  if [ -z "$LOCAL_IP" ]; then
    echo "❌ Не удалось определить локальный IP автоматически"
    echo "   Убедись, что компьютер подключен к сети"
    echo "   Или укажи IP вручную, изменив скрипт"
    exit 1
  fi

  SERVER_URL_ANDROID="http://localhost:${DEV_PORT}"
  SERVER_URL_IOS="http://${LOCAL_IP}:${DEV_PORT}"
  USE_PLATFORM_LIVE_RELOAD=true
  echo "🔧 Настройка live reload для реального устройства"
  echo "   Android: ${SERVER_URL_ANDROID} через adb reverse (realtime-safe)"
  echo "   iOS: ${SERVER_URL_IOS}"
else
  # Production - без dev-сервера
  SERVER_URL=""
  echo "🔧 Настройка для production (без dev-сервера)"
fi

# Экспортируем переменную для cap sync
export CAPACITOR_SERVER_URL="$SERVER_URL"

# Поддерживаем совместимый формат iOS-проекта перед запуском cap sync.
ensure_ios_project_object_version_compatible

# Выполняем синхронизацию
if [ "$USE_LOCAL_BUNDLE" = true ]; then
  echo "📦 Сборка локального bundle для устройства..."
  NUXT_PUBLIC_API_SERVER_URL="$API_BASE_URL" pnpm run generate
  npx cap sync && CAPACITOR_SERVER_URL="" node scripts/fix-capacitor-config.js
  node scripts/verify-capacitor-config.js
elif [ "$USE_PLATFORM_LIVE_RELOAD" = true ]; then
  echo "📦 Синхронизация с dev-сервером..."
  npx cap sync && \
    CAPACITOR_SERVER_URL_ANDROID="$SERVER_URL_ANDROID" \
    CAPACITOR_SERVER_URL_IOS="$SERVER_URL_IOS" \
    node scripts/fix-capacitor-config.js
  ensure_android_reverse_port_forwarding "$DEV_PORT"
elif [ -n "$SERVER_URL" ]; then
  echo "📦 Синхронизация с dev-сервером..."
  npx cap sync && CAPACITOR_SERVER_URL="$SERVER_URL" node scripts/fix-capacitor-config.js
else
  echo "📦 Синхронизация со статическими файлами..."
  pnpm run generate
  npx cap sync && CAPACITOR_SERVER_URL="" node scripts/fix-capacitor-config.js
  node scripts/verify-capacitor-config.js
fi

echo "✅ Готово! Теперь можно запускать приложение."
if [ "$USE_PLATFORM_LIVE_RELOAD" = true ]; then
  echo "⚠️  Для Android live reload нужен активный USB/adb reverse и dev-сервер: pnpm dev"
elif [ -n "$SERVER_URL" ]; then
  echo "⚠️  Не забудь запустить dev-сервер: pnpm dev"
elif [ "$USE_LOCAL_BUNDLE" = true ]; then
  echo "⚠️  Для обновления фронтенда на устройстве повторяй: pnpm run cap:sync:device"
fi
