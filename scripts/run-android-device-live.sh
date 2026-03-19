#!/bin/bash
set -euo pipefail

# Готовит live reload для физического Android-устройства и сразу запускает app.
# После первого запуска фронтенд обновляется автоматически, пока работает `pnpm dev`.

PORT="${CAP_DEV_PORT:-3000}"
ANDROID_APP_ID="com.mentala.app"

resolve_target_device() {
  if [ -n "${CAP_ANDROID_TARGET:-}" ]; then
    echo "$CAP_ANDROID_TARGET"
    return 0
  fi

  devices=()
  while IFS= read -r device_id; do
    if [ -n "$device_id" ]; then
      devices+=("$device_id")
    fi
  done < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')

  if [ "${#devices[@]}" -eq 0 ]; then
    echo "❌ Не найдено ни одного подключённого Android-устройства"
    echo "   Подключи устройство по USB или задай CAP_ANDROID_TARGET вручную"
    exit 1
  fi

  if [ "${#devices[@]}" -gt 1 ]; then
    echo "⚠️  Найдено несколько устройств. Использую первое: ${devices[0]}"
    echo "   Чтобы выбрать другое, задай CAP_ANDROID_TARGET=<device_id>"
  fi

  echo "${devices[0]}"
}

ensure_dev_server() {
  if ! curl -sf "http://127.0.0.1:${PORT}" >/dev/null; then
    echo "❌ Dev-сервер недоступен на http://127.0.0.1:${PORT}"
    echo "   Сначала запусти: pnpm dev"
    exit 1
  fi
}

ensure_reverse_for_target() {
  local target_device="$1"

  adb -s "$target_device" reverse "tcp:${PORT}" "tcp:${PORT}" >/dev/null
}

TARGET_DEVICE="$(resolve_target_device)"

ensure_dev_server

echo "🔧 Готовлю live reload для Android-устройства ${TARGET_DEVICE}"
echo "   Dev URL: http://localhost:${PORT} через adb reverse"

pnpm run cap:sync:device:live
ensure_reverse_for_target "$TARGET_DEVICE"

echo "📲 Устанавливаю и запускаю приложение на устройстве..."
npx cap run android --no-sync --target "${TARGET_DEVICE}"

echo "✅ Приложение запущено в live reload режиме"
echo "   Пока работает pnpm dev и активен adb reverse на localhost:${PORT},"
echo "   изменения фронтенда будут прилетать автоматически без повторного cap sync."
echo "   Если приложение зависло на старом состоянии, перезапусти его:"
echo "   adb -s ${TARGET_DEVICE} shell am force-stop ${ANDROID_APP_ID}"
echo "   adb -s ${TARGET_DEVICE} shell am start -n ${ANDROID_APP_ID}/.MainActivity"
