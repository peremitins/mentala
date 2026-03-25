#!/bin/bash
set -euo pipefail

DEV_PORT=3000
DEV_HOST="0.0.0.0"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_SERVER_HEALTH_URL="http://127.0.0.1:${DEV_PORT}"

find_listener_pids() {
  lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN -t 2>/dev/null || true
}

resolve_listener_command() {
  local pid="$1"
  ps -o command= -p "$pid" 2>/dev/null || true
}

ensure_single_dev_server() {
  local listener_pids
  listener_pids="$(find_listener_pids)"

  if [ -z "$listener_pids" ]; then
    return
  fi

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue

    local command
    command="$(resolve_listener_command "$pid")"

    if echo "$command" | grep -F "$PROJECT_ROOT" | grep -F "nuxt" | grep -F " dev " >/dev/null 2>&1; then
      if ! curl -fsSI --max-time 5 "$DEV_SERVER_HEALTH_URL" >/dev/null 2>&1; then
        echo "❌ На порту ${DEV_PORT} найден старый nuxt dev этого проекта, но он не отвечает по ${DEV_SERVER_HEALTH_URL}"
        echo "   Останови зависший процесс и запусти pnpm dev снова."
        exit 1
      fi

      echo "ℹ️  Dev-сервер Mentala уже запущен на http://127.0.0.1:${DEV_PORT}"
      echo "   Второй экземпляр не стартую, чтобы mobile runtime не уехал на другой порт."
      exit 0
    fi

    echo "❌ Порт ${DEV_PORT} уже занят другим процессом:"
    echo "   PID: ${pid}"
    echo "   CMD: ${command}"
    echo "   Освободи порт ${DEV_PORT}, затем снова запусти pnpm dev."
    exit 1
  done <<< "$listener_pids"
}

ensure_single_dev_server

pnpm dev:redis:up
./scripts/wait-for-redis.sh
exec nuxt dev --dotenv .env.development --host "$DEV_HOST" --port "$DEV_PORT"
