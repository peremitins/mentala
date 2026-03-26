#!/bin/bash
set -euo pipefail
# Скрипт для настройки Capacitor для разработки
# Использование:
#   ./scripts/setup-capacitor-dev.sh emulator          - для эмулятора
#   ./scripts/setup-capacitor-dev.sh device            - live reload через adb reverse (требует USB или wireless adb)
#   ./scripts/setup-capacitor-dev.sh device-standalone - статический bundle без кабеля (телефон и Mac в одной Wi-Fi)
#   ./scripts/setup-capacitor-dev.sh                   - без dev-сервера (production build)

DEVICE_TYPE=${1:-none}
IOS_PROJECT_FILE="ios/App/App.xcodeproj/project.pbxproj"
SERVER_URL=""
DEV_SERVER_PORT="3000"
ANDROID_DEBUG_APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
ANDROID_SERVER_URL=""
IOS_SERVER_URL=""
API_BASE_URL=""
USE_ADB_REVERSE=false
MOBILE_ENV_FILE=".env.development"
MOBILE_BUILD_MODE="development"
MOBILE_NUXT_BUILD_DIR=""

clean_nuxt_static_build_cache() {
  # Для static mobile сборок держим отдельный buildDir, чтобы не конфликтовать
  # с параллельным `pnpm dev`. Чистим только mobile-артефакты, не трогая рабочий `.nuxt`.
  rm -rf .output dist

  if [ -n "$MOBILE_NUXT_BUILD_DIR" ]; then
    rm -rf "$MOBILE_NUXT_BUILD_DIR" "node_modules/.cache/nuxt/$MOBILE_NUXT_BUILD_DIR"
  fi
}

ensure_ios_project_object_version_compatible() {
  if [ ! -f "$IOS_PROJECT_FILE" ]; then
    return
  fi

  # Xcode 26 сохраняет App.xcodeproj с objectVersion = 70, а CocoaPods 1.16.2
  # (xcodeproj 1.27.0) не умеет открывать такой формат. Для стабильного pod install
  # держим совместимую версию проекта до тех пор, пока CocoaPods не добавит поддержку.
  if grep -q "objectVersion = 70;" "$IOS_PROJECT_FILE"; then
    echo "🔧 Исправление iOS project format для CocoaPods: 70 -> 77"
    perl -0pi -e 's/objectVersion = 70;/objectVersion = 77;/' "$IOS_PROJECT_FILE"
  fi
}

run_capacitor_sync() {
  # Делаем copy/update раздельно, чтобы успеть нормализовать App.xcodeproj
  # непосредственно перед pod install.
  npx cap copy
  ensure_ios_project_object_version_compatible
  npx cap update
}

ensure_dev_server_is_available() {
  local url="$1"

  if curl -fsSI --max-time 5 "$url" >/dev/null 2>&1; then
    return
  fi

  echo "❌ Dev-сервер Mentala недоступен по адресу: $url"
  echo "   Сначала запусти: pnpm dev"
  echo "   Dev-режим для mobile теперь жёстко ожидает один рабочий сервер на порту ${DEV_SERVER_PORT}."
  exit 1
}

resolve_device_server_url() {
  local local_ip="$1"
  local caddy_proxy_url="http://${local_ip}"
  local direct_nuxt_url="http://${local_ip}:${DEV_SERVER_PORT}"
  local caddy_status

  caddy_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$caddy_proxy_url/" || true)"
  if [ "$caddy_status" = "200" ]; then
    echo "$caddy_proxy_url"
    return
  fi

  echo "$direct_nuxt_url"
}

list_connected_android_devices() {
  if ! command -v adb >/dev/null 2>&1; then
    return
  fi

  adb devices | awk 'NR > 1 && $2 == "device" { print $1 }'
}

ensure_android_reverse_port_forwarding() {
  local port="$1"
  local devices=()
  local device_id=""

  if ! command -v adb >/dev/null 2>&1; then
    return
  fi

  while IFS= read -r device_id; do
    [ -n "$device_id" ] || continue
    devices+=("$device_id")
  done < <(list_connected_android_devices)

  if [ "${#devices[@]}" -eq 0 ]; then
    return
  fi

  echo "🔌 Настраиваю adb reverse для Android (${port} -> ${port})"
  for device_id in "${devices[@]}"; do
    adb -s "$device_id" reverse "tcp:${port}" "tcp:${port}" >/dev/null
    echo "   • ${device_id}: localhost:${port} -> host:${port}"
  done
}

device_can_reach_url() {
  local device_id="$1"
  local url="$2"
  local status=""

  if [ -z "$device_id" ] || [ -z "$url" ]; then
    return 1
  fi

  if ! command -v adb >/dev/null 2>&1; then
    return 1
  fi

  status="$(
    adb -s "$device_id" shell \
      "curl -sS -o /dev/null -w '%{http_code}' --max-time 5 '${url}/'" 2>/dev/null |
      tr -d '\r'
  )"

  [ "$status" = "200" ]
}

deploy_android_debug_build_to_connected_devices() {
  if [ "$DEVICE_TYPE" != "device" ] && [ "$DEVICE_TYPE" != "device-standalone" ]; then
    return
  fi

  if ! command -v adb >/dev/null 2>&1; then
    echo "ℹ️  adb не найден, автоматическую установку Android debug APK пропускаю."
    return
  fi

  local devices=()
  local device_id=""
  while IFS= read -r device_id; do
    [ -n "$device_id" ] || continue
    devices+=("$device_id")
  done < <(list_connected_android_devices)

  if [ "${#devices[@]}" -eq 0 ]; then
    echo "ℹ️  Подключённое Android-устройство не найдено."
    echo "   Если на телефоне уже установлена старая APK, она продолжит использовать старый server.url."
    echo "   Подключи устройство и повтори: pnpm run cap:sync:${DEVICE_TYPE}"
    return
  fi

  # После изменения server.url нужно обновить установленную APK, иначе телефон продолжит
  # запускать старый Capacitor runtime даже при правильном локальном проекте.
  echo "📲 Собираю debug APK, чтобы обновить Capacitor runtime на телефоне..."
  (
    cd android
    ./gradlew assembleDebug
  )

  if [ ! -f "$ANDROID_DEBUG_APK_PATH" ]; then
    echo "❌ После сборки не найден APK: $ANDROID_DEBUG_APK_PATH"
    exit 1
  fi

  for device_id in "${devices[@]}"; do
    echo "📥 Устанавливаю debug APK на устройство: ${device_id}"
    adb -s "$device_id" install -r "$ANDROID_DEBUG_APK_PATH" >/dev/null
    echo "   • ${device_id}: APK обновлена"
  done
}

if [ "$DEVICE_TYPE" = "emulator" ]; then
  # Для эмулятора используем специальный IP
  SERVER_URL="http://10.0.2.2:${DEV_SERVER_PORT}"
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
  
  # Для реального устройства предпочитаем вход через локальный Caddy на 80 порту:
  # этот маршрут стабильнее для мобильных браузеров/WebView, чем прямой вход в nuxt dev.
  # Если Caddy недоступен, fallback остаётся на прямой nuxt dev порт.
  SERVER_URL="$(resolve_device_server_url "$LOCAL_IP")"
  ANDROID_SERVER_URL="$SERVER_URL"
  IOS_SERVER_URL="$SERVER_URL"

  FIRST_ANDROID_DEVICE="$(list_connected_android_devices | head -n 1)"
  if [ -n "$FIRST_ANDROID_DEVICE" ]; then
    # Для Android realtime voice нужен secure origin. В dev это надёжнее всего
    # обеспечивается через localhost + adb reverse, даже если LAN тоже доступен.
    ANDROID_SERVER_URL="http://localhost:${DEV_SERVER_PORT}"
    USE_ADB_REVERSE=true
    echo "🔧 Настройка для Android-устройства: ${ANDROID_SERVER_URL} через adb reverse"
    if device_can_reach_url "$FIRST_ANDROID_DEVICE" "$SERVER_URL"; then
      echo "   LAN-маршрут доступен, но для realtime voice всё равно используем localhost, чтобы сохранить secure-context для микрофона."
    else
      echo "   Прямой доступ телефона к ${SERVER_URL} недоступен, поэтому LAN-IP не используем."
    fi
  else
    echo "🔧 Настройка для реального устройства: $SERVER_URL"
    echo "   ⚠️ Android-устройство не подключено по adb, поэтому secure localhost-маршрут для realtime voice сейчас недоступен."
  fi

  # iOS: WKWebView не предоставляет navigator.mediaDevices на HTTP non-localhost origin.
  # У iOS нет аналога adb reverse (iproxy туннелирует Mac→Device, а не Device→Mac).
  # Поэтому в device-режиме iOS использует LAN IP — всё работает кроме Realtime Voice.
  # Для Realtime Voice на iOS используй device-standalone (Capacitor раздаёт файлы локально = secure context).
  echo "   ℹ️  iOS: Realtime Voice в device-режиме недоступен (WKWebView ограничение)."
  echo "   Для Realtime Voice на iOS используй: pnpm cap:sync:device:standalone"

  echo "   Убедись, что dev-сервер запущен: pnpm dev"
elif [ "$DEVICE_TYPE" = "device-standalone" ]; then
  # Для устройства без USB-кабеля — статический bundle + API по LAN IP.
  # Capacitor раздаёт файлы через встроенный сервер (http://localhost) →
  # secure context → Realtime Voice работает. Кабель не нужен после установки APK.
  LOCAL_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)

  if [ -z "$LOCAL_IP" ]; then
    echo "❌ Не удалось определить локальный IP автоматически"
    echo "   Убедись, что компьютер подключен к Wi-Fi сети"
    exit 1
  fi

  API_BASE_URL="http://${LOCAL_IP}:${DEV_SERVER_PORT}"
  MOBILE_NUXT_BUILD_DIR=".nuxt-capacitor-standalone"
  echo "🔧 Настройка для устройства без кабеля: bundle + API ${API_BASE_URL}"
  echo "   Телефон и MacBook должны быть в одной Wi-Fi сети."
  echo "   Realtime Voice работает: Capacitor раздаёт файлы через http://localhost (secure context)."
  echo "   Первый запуск: подключи телефон по USB для установки APK, потом кабель можно убрать."
  echo "   Убедись, что dev-сервер запущен: pnpm dev"
else
  # Production - без dev-сервера
  SERVER_URL=""
  MOBILE_ENV_FILE=".env.production"
  MOBILE_BUILD_MODE="release"
  MOBILE_NUXT_BUILD_DIR=".nuxt-capacitor-release"
  echo "🔧 Настройка для production (без dev-сервера)"
  echo "   Env: ${MOBILE_ENV_FILE}"
fi

# Экспортируем переменную для cap sync
export CAPACITOR_SERVER_URL="$SERVER_URL"

# Поддерживаем совместимый формат iOS-проекта перед запуском cap sync.
ensure_ios_project_object_version_compatible

# Синхронизируем iOS OAuth-конфиг с тем env, из которого будет собран мобильный bundle.
node scripts/sync-ios-oauth-config.js \
  --env-file "$MOBILE_ENV_FILE" \
  --mode "$MOBILE_BUILD_MODE"

# Выполняем синхронизацию
if [ "$DEVICE_TYPE" = "device" ]; then
  ensure_dev_server_is_available "http://127.0.0.1:${DEV_SERVER_PORT}"
  echo "📦 Синхронизация с dev-сервером..."
  run_capacitor_sync && \
    CAPACITOR_SERVER_URL="$SERVER_URL" \
    CAPACITOR_SERVER_URL_ANDROID="$ANDROID_SERVER_URL" \
    CAPACITOR_SERVER_URL_IOS="$IOS_SERVER_URL" \
    node scripts/fix-capacitor-config.js
  if [ "$USE_ADB_REVERSE" = true ]; then
    ensure_android_reverse_port_forwarding "$DEV_SERVER_PORT"
  fi
  deploy_android_debug_build_to_connected_devices
elif [ "$DEVICE_TYPE" = "device-standalone" ]; then
  ensure_dev_server_is_available "http://127.0.0.1:${DEV_SERVER_PORT}"
  echo "📦 Сборка статического bundle для устройства без кабеля..."
  clean_nuxt_static_build_cache
  MENTALA_STATIC_GENERATE=true \
    MENTALA_NUXT_BUILD_DIR="$MOBILE_NUXT_BUILD_DIR" \
    NUXT_PUBLIC_API_SERVER_URL="$API_BASE_URL" \
    pnpm run generate:dev
  run_capacitor_sync && CAPACITOR_SERVER_URL="" node scripts/fix-capacitor-config.js
  node scripts/verify-capacitor-config.js
  deploy_android_debug_build_to_connected_devices
elif [ -n "$SERVER_URL" ]; then
  ensure_dev_server_is_available "http://127.0.0.1:${DEV_SERVER_PORT}"
  echo "📦 Синхронизация с dev-сервером..."
  run_capacitor_sync && CAPACITOR_SERVER_URL="$SERVER_URL" node scripts/fix-capacitor-config.js
else
  echo "📦 Синхронизация со статическими файлами..."
  clean_nuxt_static_build_cache
  MENTALA_STATIC_GENERATE=true \
    MENTALA_NUXT_BUILD_DIR="$MOBILE_NUXT_BUILD_DIR" \
    pnpm exec nuxt generate --dotenv "$MOBILE_ENV_FILE"
  run_capacitor_sync && CAPACITOR_SERVER_URL="" node scripts/fix-capacitor-config.js
  node scripts/verify-capacitor-config.js
fi

echo "✅ Готово! Теперь можно запускать приложение."
if [ "$DEVICE_TYPE" = "device-standalone" ]; then
  echo "⚠️  APK настроена для работы без USB-кабеля."
  echo "   API: ${API_BASE_URL}"
  echo "   Телефон и MacBook должны быть в одной Wi-Fi сети."
  echo "⚠️  Не забудь запустить dev-сервер: pnpm dev"
  echo "   При изменении кода повтори: pnpm cap:sync:device:standalone"
elif [ -n "$SERVER_URL" ]; then
  echo "⚠️  Не забудь запустить dev-сервер: pnpm dev"
  if [ "$USE_ADB_REVERSE" = true ]; then
    echo "⚠️  Для Android в этом окружении включён localhost через adb reverse."
    echo "   Если нужен режим без USB-кабеля, используй: pnpm cap:sync:device:standalone"
  fi
fi
