#!/usr/bin/env bash
# Установка/обновление Mentala Disk Guard на сервере.
# Идемпотентно: можно запускать многократно, файл с секретами не перезаписывается.
#
# Использование (на сервере):
#   sudo ./install.sh                  # установить или обновить из текущей папки репо
#   sudo ./install.sh --uninstall      # снять таймер и удалить юниты (секрет и state не трогаем)
#   sudo ./install.sh --status         # показать статус и последний запуск
#   sudo ./install.sh --run-once       # принудительно запустить с FORCE_NOTIFY=1
#
# Что устанавливает:
#   /usr/local/bin/mentala-disk-guard.sh                 (chmod 755 root:root)
#   /etc/systemd/system/mentala-disk-guard.service       (chmod 644 root:root)
#   /etc/systemd/system/mentala-disk-guard.timer         (chmod 644 root:root)
#   /etc/mentala/telegram.env                            (chmod 600 root:root, ТОЛЬКО шаблон если нет)
#   /var/lib/mentala/                                    (chmod 700 root:root)

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

DST_BIN="/usr/local/bin/mentala-disk-guard.sh"
DST_SERVICE="/etc/systemd/system/mentala-disk-guard.service"
DST_TIMER="/etc/systemd/system/mentala-disk-guard.timer"
DST_ENV_DIR="/etc/mentala"
DST_ENV="${DST_ENV_DIR}/telegram.env"
STATE_DIR="/var/lib/mentala"

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Запусти под root: sudo $0 $*" >&2
    exit 1
  fi
}

check_files_exist() {
  local missing=0
  for f in "${SCRIPT_DIR}/disk-guard.sh" \
           "${SCRIPT_DIR}/mentala-disk-guard.service" \
           "${SCRIPT_DIR}/mentala-disk-guard.timer" \
           "${SCRIPT_DIR}/telegram.env.example"; do
    if [ ! -f "$f" ]; then
      echo "Не найден файл: $f" >&2
      missing=1
    fi
  done
  [ "$missing" -eq 0 ] || exit 1
}

install_files() {
  echo "▶ Установка disk-guard в систему"

  install -o root -g root -m 0755 "${SCRIPT_DIR}/disk-guard.sh" "${DST_BIN}"
  echo "  ✓ ${DST_BIN}"

  install -o root -g root -m 0644 "${SCRIPT_DIR}/mentala-disk-guard.service" "${DST_SERVICE}"
  echo "  ✓ ${DST_SERVICE}"

  install -o root -g root -m 0644 "${SCRIPT_DIR}/mentala-disk-guard.timer" "${DST_TIMER}"
  echo "  ✓ ${DST_TIMER}"

  install -o root -g root -m 0700 -d "${DST_ENV_DIR}"
  install -o root -g root -m 0700 -d "${STATE_DIR}"

  if [ -f "${DST_ENV}" ]; then
    echo "  • ${DST_ENV} уже существует — НЕ перезаписываем (там твои секреты)"
  else
    install -o root -g root -m 0600 "${SCRIPT_DIR}/telegram.env.example" "${DST_ENV}"
    echo "  ⚠ ${DST_ENV} создан из шаблона — впиши TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID и запусти install.sh снова"
  fi
}

reload_systemd() {
  systemctl daemon-reload
  echo "  ✓ systemctl daemon-reload"
}

enable_timer() {
  if grep -q "^TELEGRAM_BOT_TOKEN=$" "${DST_ENV}" 2>/dev/null \
     || ! grep -q "^TELEGRAM_BOT_TOKEN=." "${DST_ENV}" 2>/dev/null; then
    echo "  ⚠ В ${DST_ENV} не задан TELEGRAM_BOT_TOKEN — таймер не активирую."
    echo "    Заполни секреты и запусти ещё раз: sudo $0"
    return 0
  fi
  if grep -q "^TELEGRAM_CHAT_ID=$" "${DST_ENV}" 2>/dev/null \
     || ! grep -q "^TELEGRAM_CHAT_ID=." "${DST_ENV}" 2>/dev/null; then
    echo "  ⚠ В ${DST_ENV} не задан TELEGRAM_CHAT_ID — таймер не активирую."
    return 0
  fi

  systemctl enable --now mentala-disk-guard.timer
  echo "  ✓ systemctl enable --now mentala-disk-guard.timer"
}

show_status() {
  echo "▶ Статус таймера"
  systemctl status mentala-disk-guard.timer --no-pager || true
  echo
  echo "▶ Последний запуск сервиса"
  systemctl status mentala-disk-guard.service --no-pager || true
  echo
  echo "▶ Последние записи в журнале"
  journalctl -u mentala-disk-guard.service --since "24 hours ago" --no-pager | tail -40 || true
}

run_once() {
  echo "▶ Принудительный запуск с FORCE_NOTIFY=1 (отправит уведомление в TG)"
  systemd-run --quiet --pipe --wait \
    --unit "mentala-disk-guard-once-$(date +%s)" \
    --setenv=FORCE_NOTIFY=1 \
    --service-type=oneshot \
    --property=EnvironmentFile=/etc/mentala/telegram.env \
    /usr/local/bin/mentala-disk-guard.sh
}

uninstall() {
  echo "▶ Деинсталляция disk-guard"
  systemctl disable --now mentala-disk-guard.timer 2>/dev/null || true
  systemctl stop mentala-disk-guard.service 2>/dev/null || true
  rm -f "${DST_TIMER}" "${DST_SERVICE}" "${DST_BIN}"
  systemctl daemon-reload
  echo "  ✓ unit-файлы и скрипт удалены"
  echo "  • ${DST_ENV} (секреты) и ${STATE_DIR} (state) НЕ трогаем — удали вручную если нужно"
}

main() {
  require_root "$@"

  case "${1:-install}" in
    install|"")
      check_files_exist
      install_files
      reload_systemd
      enable_timer
      echo
      echo "Готово. Проверка:"
      echo "  sudo $0 --status"
      echo "  sudo $0 --run-once   # пнуть руками с уведомлением в TG"
      ;;
    --status|status)
      show_status
      ;;
    --run-once|run-once)
      run_once
      ;;
    --uninstall|uninstall)
      uninstall
      ;;
    -h|--help|help)
      sed -n '2,15p' "$0"
      ;;
    *)
      echo "Неизвестная команда: $1" >&2
      echo "См. $0 --help" >&2
      exit 2
      ;;
  esac
}

main "$@"
