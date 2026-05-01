#!/usr/bin/env bash
# Mentala Disk Guard
#
# Мониторинг занятости диска + автоматическая очистка Docker и журнала + Telegram-уведомления.
# Запускается systemd-таймером каждые 10 минут (см. mentala-disk-guard.timer).
#
# Конфиг через окружение (см. mentala-disk-guard.service / EnvironmentFile=/etc/mentala/telegram.env):
#   DISK_MOUNT             — точка монтирования (по умолчанию /)
#   WARN_PCT, CRIT_PCT     — пороги в %
#   WARN_PRUNE_HOURS       — image prune в WARN-режиме (--filter until=)
#   CRIT_PRUNE_HOURS       — image prune в CRIT-режиме (--filter until=)
#   WARN_REPEAT_MINUTES    — как часто повторять WARN-алерт при сохранении состояния
#   CRIT_REPEAT_MINUTES    — то же для CRIT
#   FORCE_NOTIFY=1         — отправить уведомление принудительно
#   TELEGRAM_BOT_TOKEN     — токен бота
#   TELEGRAM_CHAT_ID       — chat id
#   TELEGRAM_THREAD_ID     — опционально: id треда в супергруппе

set -euo pipefail

LOCK_FILE="/run/lock/mentala-disk-guard.lock"
STATE_DIR="/var/lib/mentala"
STATE_FILE="${STATE_DIR}/disk-guard.state"
LAST_NOTIFY_FILE="${STATE_DIR}/disk-guard.last_notify_epoch"

DISK_MOUNT="${DISK_MOUNT:-/}"

WARN_PCT="${WARN_PCT:-85}"
CRIT_PCT="${CRIT_PCT:-92}"

WARN_PRUNE_HOURS="${WARN_PRUNE_HOURS:-72}"
CRIT_PRUNE_HOURS="${CRIT_PRUNE_HOURS:-168}"

WARN_REPEAT_MINUTES="${WARN_REPEAT_MINUTES:-60}"
CRIT_REPEAT_MINUTES="${CRIT_REPEAT_MINUTES:-10}"

FORCE_NOTIFY="${FORCE_NOTIFY:-0}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
TELEGRAM_THREAD_ID="${TELEGRAM_THREAD_ID:-}"

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
now_epoch() { date -u +"%s"; }

log() { echo "[disk-guard] $(now_iso) $*"; }
host_name() { hostname -f 2>/dev/null || hostname; }

ensure_state_dir() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR" || true
}

read_last_state() {
  if [[ -f "$STATE_FILE" ]]; then
    cat "$STATE_FILE" 2>/dev/null || true
  else
    echo ""
  fi
}

write_state() {
  local s="$1"
  printf "%s" "$s" > "$STATE_FILE"
  chmod 600 "$STATE_FILE" || true
}

read_last_notify_epoch() {
  if [[ -f "$LAST_NOTIFY_FILE" ]]; then
    cat "$LAST_NOTIFY_FILE" 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

write_last_notify_epoch() {
  local e="$1"
  printf "%s" "$e" > "$LAST_NOTIFY_FILE"
  chmod 600 "$LAST_NOTIFY_FILE" || true
}

send_telegram() {
  local text="$1"

  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    log "Telegram env not set, skip notify."
    return 0
  fi

  local curl_args=(
    -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
    -d "chat_id=${TELEGRAM_CHAT_ID}"
    --data-urlencode "text=${text}"
    -d "parse_mode=Markdown"
    -d "disable_web_page_preview=true"
  )

  if [ -n "${TELEGRAM_THREAD_ID:-}" ]; then
    curl_args+=( -d "message_thread_id=${TELEGRAM_THREAD_ID}" )
  fi

  if curl "${curl_args[@]}" >/dev/null; then
    log "Telegram message sent."
    return 0
  fi

  log "Telegram send failed."
  return 1
}

disk_used_pct() {
  df -P "$DISK_MOUNT" | awk 'NR==2 {gsub("%","",$5); print $5}'
}

df_device() { df -h "$DISK_MOUNT" | awk 'NR==2{print $1}'; }
df_used_human() { df -h "$DISK_MOUNT" | awk 'NR==2{print $3}'; }
df_total_human() { df -h "$DISK_MOUNT" | awk 'NR==2{print $2}'; }
df_avail_human() { df -h "$DISK_MOUNT" | awk 'NR==2{print $4}'; }

docker_df_compact() {
  timeout 20s docker system df 2>/dev/null | awk '
    BEGIN { print "TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE" }
    NR==1 { next }
    /Images/ || /Containers/ || /Local Volumes/ || /Build Cache/ { print }
  ' || true
}

run_action() {
  local label="$1"
  shift
  local cmd=( "$@" )

  log "Run: ${label}: ${cmd[*]}"
  if timeout 900s "${cmd[@]}" >/dev/null 2>&1; then
    log "OK: ${label}"
    printf "• %s: ✅\n" "$label"
    return 0
  fi

  log "FAIL: ${label}"
  printf "• %s: ❌\n" "$label"
  return 1
}

truncate_docker_logs() {
  local f
  while IFS= read -r -d '' f; do
    : > "$f" || true
  done < <(find /var/lib/docker/containers -type f -name "*-json.log" -print0 2>/dev/null || true)
}

calc_state() {
  local used_pct="$1"

  if [ "$used_pct" -ge "${CRIT_PCT}" ]; then
    echo "CRIT"
    return 0
  fi

  if [ "$used_pct" -ge "${WARN_PCT}" ]; then
    echo "WARN"
    return 0
  fi

  echo "OK"
}

state_title() {
  local state="$1"
  if [ "$state" = "CRIT" ]; then
    echo "🚨 Mentala. Критично. Диск почти заполнен"
    return 0
  fi
  if [ "$state" = "WARN" ]; then
    echo "⚠️ Mentala. Предупреждение. Диск заполняется"
    return 0
  fi
  echo "✅ Mentala. Диск в норме"
}

should_notify() {
  local new_state="$1"
  local last_state="$2"

  if [ "$FORCE_NOTIFY" = "1" ]; then
    return 0
  fi

  ensure_state_dir

  if [[ "$new_state" != "$last_state" ]]; then
    return 0
  fi

  local repeat_minutes="0"
  if [ "$new_state" = "WARN" ]; then
    repeat_minutes="${WARN_REPEAT_MINUTES}"
  elif [ "$new_state" = "CRIT" ]; then
    repeat_minutes="${CRIT_REPEAT_MINUTES}"
  else
    repeat_minutes="0"
  fi

  if [ "$repeat_minutes" = "0" ]; then
    return 1
  fi

  local last_epoch now_e diff
  last_epoch="$(read_last_notify_epoch)"
  now_e="$(now_epoch)"
  diff="$(( now_e - last_epoch ))"

  if [ "$diff" -ge "$(( repeat_minutes * 60 ))" ]; then
    return 0
  fi

  return 1
}

make_message() {
  local state="$1"
  local before_used="$2"
  local before_avail="$3"
  local before_pct="$4"
  local after_used="$5"
  local after_avail="$6"
  local after_pct="$7"
  local actions_block="$8"
  local docker_before="$9"
  local docker_after="${10}"

  local host disk mount time total
  host="$(host_name)"
  disk="$(df_device)"
  mount="${DISK_MOUNT}"
  time="$(now_iso)"
  total="$(df_total_human)"

  local title
  title="$(state_title "$state")"

  if [ "$state" = "OK" ]; then
    cat <<EOF
${title}

🕒 *Время (UTC):* ${time}
🖥 *Сервер:* ${host}
📍 *Точка монтирования:* ${mount}
💽 *Диск:* ${disk}

📊 *Состояние*
• Использовано: *${after_used}* из *${total}* (*${after_pct}%*)
• Свободно: *${after_avail}*

🧹 *Действия*
• Очистка: ⛔ пропущено, уровень OK
EOF
    return 0
  fi

  if [ "$state" = "WARN" ]; then
    cat <<EOF
${title}

🕒 *Время (UTC):* ${time}
🖥 *Сервер:* ${host}
📍 *Точка монтирования:* ${mount}
💽 *Диск:* ${disk}

📊 *Было и стало*
• Было: *${before_used}* из *${total}* (*${before_pct}%*), свободно *${before_avail}*
• Стало: *${after_used}* из *${total}* (*${after_pct}%*), свободно *${after_avail}*

🧹 *Действия*
${actions_block}

🐳 *Docker system df (после)*
\`\`\`
${docker_after}
\`\`\`
EOF
    return 0
  fi

  cat <<EOF
${title}

🕒 *Время (UTC):* ${time}
🖥 *Сервер:* ${host}
📍 *Точка монтирования:* ${mount}
💽 *Диск:* ${disk}

📊 *Было и стало*
• Было: *${before_used}* из *${total}* (*${before_pct}%*), свободно *${before_avail}*
• Стало: *${after_used}* из *${total}* (*${after_pct}%*), свободно *${after_avail}*

🧹 *Действия*
${actions_block}

🐳 *Docker system df*
\`\`\`
До:
${docker_before}

После:
${docker_after}
\`\`\`
EOF
}

main() {
  ensure_state_dir

  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "Another instance is running, exit."
    exit 0
  fi

  local before_used before_avail before_pct
  before_used="$(df_used_human)"
  before_avail="$(df_avail_human)"
  before_pct="$(disk_used_pct)"

  local docker_before
  docker_before="$(docker_df_compact)"

  local state last_state
  state="$(calc_state "$before_pct")"
  last_state="$(read_last_state)"

  log "Disk mount=${DISK_MOUNT} used=${before_pct}% df='$(df -h "$DISK_MOUNT" | tail -n 1)' last_state='${last_state}' state='${state}' force_notify='${FORCE_NOTIFY}'"

  local actions_block=""
  if [ "$state" = "WARN" ]; then
    actions_block="$(
      {
        run_action "docker container prune" docker container prune -f || true
        run_action "docker network prune" docker network prune -f || true
        run_action "docker builder prune" docker builder prune -a -f || true
        run_action "docker image prune (until=${WARN_PRUNE_HOURS}h)" docker image prune -a -f --filter "until=${WARN_PRUNE_HOURS}h" || true
      } 2>/dev/null
    )"
  fi

  if [ "$state" = "CRIT" ]; then
    actions_block="$(
      {
        run_action "docker container prune" docker container prune -f || true
        run_action "docker network prune" docker network prune -f || true
        run_action "docker builder prune" docker builder prune -a -f || true
        run_action "docker image prune (until=${CRIT_PRUNE_HOURS}h)" docker image prune -a -f --filter "until=${CRIT_PRUNE_HOURS}h" || true
        run_action "journald vacuum (7d)" journalctl --vacuum-time=7d || true
      } 2>/dev/null
    )"

    local after_prune_pct
    after_prune_pct="$(disk_used_pct)"
    if [ "$after_prune_pct" -ge "${CRIT_PCT}" ]; then
      actions_block="${actions_block}$(printf "• %s: ✅\n" "truncate docker json logs")"
      timeout 120s truncate_docker_logs >/dev/null 2>&1 || true
    else
      actions_block="${actions_block}$(printf "• %s: ⛔ не потребовалось\n" "truncate docker json logs")"
    fi
  fi

  local after_used after_avail after_pct
  after_used="$(df_used_human)"
  after_avail="$(df_avail_human)"
  after_pct="$(disk_used_pct)"

  local docker_after
  docker_after="$(docker_df_compact)"

  if should_notify "$state" "$last_state"; then
    write_state "$state"
    write_last_notify_epoch "$(now_epoch)"
    local msg
    msg="$(make_message "$state" "$before_used" "$before_avail" "$before_pct" "$after_used" "$after_avail" "$after_pct" "$actions_block" "$docker_before" "$docker_after")"
    send_telegram "$msg" || true
  else
    log "No notify: state unchanged (${state}) and repeat window not reached."
  fi
}

main "$@"
