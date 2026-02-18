Ниже полноценное техническое задание, которое закрывает твою боль по диску, делает профилактику по best practice, добавляет аварийную автоочистку и уведомления в Telegram. Плюс, в конце есть план проверки “в бою” на текущем сервере.

⸻

Техническое задание: Автоматическая очистка диска Docker и уведомления в Telegram

1. Контекст и проблема

На сервере /dev/vda1 размером 48 гигабайт занято 94 процента, свободно около 2.9 гигабайта.

Docker хранит образы и слои в /var/lib/docker или через containerd в /var/lib/containerd. При нехватке места Docker не может распаковать слои образов и падает деплой (ошибка no space left on device).

По docker system df видно:
• Images: 44.52 гигабайта, reclaimable всего 3.535 гигабайта
• Это значит, что одной очисткой “мусора” ты не вылечишь проблему навсегда. Нужны: 1. профилактика роста (log rotation, ограничение логов, чистка релизов), 2. регулярная очистка неиспользуемого, 3. аварийный механизм при достижении критики, 4. уведомления, 5. отдельно, увеличение диска как правильное стратегическое решение.

⸻

2. Цели
   1. Стабилизировать диск, чтобы деплой и docker pull не падали.
   2. Автоматически чистить безопасные сущности, которые не ломают прод:
      • неиспользуемые образы
      • build cache
      • “висячие” контейнеры и сети
   3. Автоматически обрезать Docker логи (основной источник неконтролируемого роста).
   4. Уведомлять в Telegram при достижении порогов занятости диска.
   5. Провести проверку на текущей инфраструктуре, без ручного “удаления всего подряд”.

⸻

3. Не цели
   1. Не удалять volumes с данными PostgreSQL, Redis и других stateful сервисов.
   2. Не вмешиваться в данные приложения, базу, миграции.
   3. Не “ломать” текущую структуру dev и prod на одном сервере, только стабилизация.

⸻

4. Решение, best practice архитектура

Решение делится на 3 слоя.

4.1. Ограничение роста логов Docker (обязательно)

Настроить Docker daemon log rotation. Это предотвращает рост файлов \*-json.log до гигабайтов.

4.2. Регулярная безопасная очистка (плановая)

Раз в сутки или раз в неделю запускать очистку:
• docker image prune -a с фильтром “старше N часов”
• docker builder prune
• docker container prune
• docker network prune

Без volumes.

4.3. Аварийная очистка при критике (условная)

Периодически проверять:
• занятость корневого раздела
• занятость Docker images

Если выше критического порога:
• выполнить усиленную очистку образов и build cache
• при необходимости дополнительно обрезать логи контейнеров
• отправить уведомление в Telegram о выполненных действиях и о результате

⸻

5. Пороги и политика действий

5.1. Пороги
• WARNING: занятость диска >= 85 процентов
• CRITICAL: занятость диска >= 92 процента

Почему так:
• при 94 процентах у тебя уже ломается распаковка слоев
• критический порог 92 позволяет “успеть” среагировать.

5.2. Действия
• WARNING:
• отправить уведомление в Telegram
• очистку не выполнять, чтобы не было сюрпризов
• CRITICAL:
• выполнить очистку:
• prune images старше 24 часов
• prune builder cache
• prune stopped containers
• prune networks
• отправить уведомление “сделал чистку” плюс df -h и docker system df

⸻

6. Реализация на сервере

Реализация через systemd service + timer, это стандарт для серверов Linux и проще, чем городить отдельные контейнеры.

6.1. Файл Docker daemon log rotation

Файл: /etc/docker/daemon.json

{
"log-driver": "json-file",
"log-opts": {
"max-size": "20m",
"max-file": "3"
}
}

Применение:

sudo mkdir -p /etc/docker
sudo nano /etc/docker/daemon.json
sudo systemctl restart docker

Ожидаемый эффект:
• каждый контейнер хранит максимум 60 мегабайт логов (20 мегабайт \* 3 файла)
• логи перестают расти бесконечно.

⸻

6.2. Скрипт мониторинга, очистки и Telegram уведомлений

Файл: /usr/local/bin/mentala-disk-guard.sh

#!/usr/bin/env bash
set -euo pipefail

DISK_MOUNT="${DISK_MOUNT:-/}"
WARN_PCT="${WARN_PCT:-85}"
CRIT_PCT="${CRIT_PCT:-92}"
PRUNE_HOURS="${PRUNE_HOURS:-24}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

send_telegram() {
local text="$1"
  if [[ -z "$TELEGRAM_BOT_TOKEN" || -z "$TELEGRAM_CHAT_ID" ]]; then
    echo "[disk-guard] Telegram not configured, message:"
    echo "$text"
return 0
fi

curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
 -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
 -d "disable_web_page_preview=true" >/dev/null
}

disk_used_pct() {
df -P "$DISK_MOUNT" | awk 'NR==2 {gsub("%","",$5); print $5}'
}

df_h() {
df -h "$DISK_MOUNT" | tail -n 1
}

docker_df() {
docker system df 2>/dev/null || true
}

prune_safe() {

# Важно: volumes НЕ трогаем

docker container prune -f || true
docker network prune -f || true
docker builder prune -a -f || true

# Удаляем неиспользуемые образы, но только старше PRUNE_HOURS часов

docker image prune -a -f --filter "until=${PRUNE_HOURS}h" || true
}

truncate_docker_logs() {

# Обрезаем json логи контейнеров, если они раздулись

# Это не ломает контейнер, просто очищает файл логов

local paths
paths="$(sudo find /var/lib/docker/containers -type f -name "*-json.log" 2>/dev/null || true)"
  if [[ -n "$paths" ]]; then # shellcheck disable=SC2086
sudo sh -c "for f in $paths; do : > \"\$f\"; done" || true
fi
}

main() {
local used
used="$(disk_used_pct)"

if (( used >= CRIT_PCT )); then
local before_df after_df
before_df="$(df_h)"
    local before_docker
    before_docker="$(docker_df)"

    prune_safe

    # Если после prune все еще критично, обрезаем логи как emergency шаг
    local used_after_prune
    used_after_prune="$(disk_used_pct)"
    if (( used_after_prune >= CRIT_PCT )); then
      truncate_docker_logs || true
    fi

    after_df="$(df_h)"
    local after_docker
    after_docker="$(docker_df)"

    send_telegram "MENTALA DISK CRITICAL

Time: $(now_iso)
Mount: ${DISK_MOUNT}
Used before: ${used}%
df before: ${before_df}

Action: docker prunes (no volumes), maybe log truncate
df after: ${after_df}

docker system df before:
${before_docker}

docker system df after:
${after_docker}
"
exit 0
fi

if (( used >= WARN_PCT )); then
send_telegram "MENTALA DISK WARNING
Time: $(now_iso)
Mount: ${DISK_MOUNT}
Used: ${used}%
df: $(df_h)

Recommendation: check docker images, landing releases, consider disk resize."
exit 0
fi

exit 0
}

main "$@"

Права:

sudo nano /usr/local/bin/mentala-disk-guard.sh
sudo chmod +x /usr/local/bin/mentala-disk-guard.sh

⸻

6.3. Systemd unit и timer

Файл: /etc/systemd/system/mentala-disk-guard.service

[Unit]
Description=Mentala Disk Guard (monitor + prune + telegram)
Wants=network-online.target docker.service
After=network-online.target docker.service

[Service]
Type=oneshot
Environment=DISK_MOUNT=/
Environment=WARN_PCT=85
Environment=CRIT_PCT=92
Environment=PRUNE_HOURS=24

# Вставить токен и чат айди здесь, или подключить через отдельный env файл

Environment=TELEGRAM_BOT_TOKEN=REPLACE_ME
Environment=TELEGRAM_CHAT_ID=REPLACE_ME

ExecStart=/usr/local/bin/mentala-disk-guard.sh

Файл: /etc/systemd/system/mentala-disk-guard.timer

[Unit]
Description=Run Mentala Disk Guard every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
AccuracySec=30s
Persistent=true

[Install]
WantedBy=timers.target

Применение:

sudo nano /etc/systemd/system/mentala-disk-guard.service
sudo nano /etc/systemd/system/mentala-disk-guard.timer

sudo systemctl daemon-reload
sudo systemctl enable --now mentala-disk-guard.timer
systemctl list-timers | grep mentala-disk-guard || true

⸻

7. Telegram: как настроить уведомления

7.1. Создать бота 1. Открой Telegram и найди @BotFather 2. Команда: /newbot 3. Задай имя и username 4. BotFather выдаст токен вида 123456:ABC-DEF...

Этот токен вставишь в TELEGRAM_BOT_TOKEN.

7.2. Куда слать уведомления: личный чат или канал

Вариант 1. Личный чат (самый простой) 1. Найди своего нового бота в Telegram 2. Нажми Start 3. Теперь можно получить chat_id

Получение chat_id:
• открой в браузере:
• https://api.telegram.org/bot<TOKEN>/getUpdates
• в ответе найдешь chat":{"id":...}

Этот id вставляешь в TELEGRAM_CHAT_ID.

Вариант 2. Канал (правильно для команды) 1. Создай канал в Telegram 2. Добавь туда бота как администратора (минимум право “публиковать сообщения”) 3. Отправь любое сообщение в канал 4. Получи chat_id через getUpdates

Важно:
• у каналов chat_id обычно отрицательный, например -1001234567890

7.3. Доступы для команды

Когда команда расширится:
• не раздавай токен всем
• добавляй людей в канал
• бот остается один, токен хранится только на сервере

⸻

8. Проверка “в бою” на текущем сервере

8.1. Проверка Telegram

Перед включением таймера проверь ручным запуском: 1. Впиши токен и chat id в service файл 2. Запусти:

sudo systemctl start mentala-disk-guard.service
sudo systemctl status mentala-disk-guard.service --no-pager

Если диск сейчас 94 процента, он должен:
• выполнить prune
• отправить CRITICAL уведомление

8.2. Проверка, что очистка не ломает прод

После срабатывания:
• docker ps должен показывать web, postgres, redis, landing, traefik в Running
• открыть:
• https://mentala.app
• https://my.mentala.app (с basic auth)
• проверить endpoint /api/landing/lead preflight

8.3. Проверка лог-лимитов Docker

После установки daemon.json:
• перезапусти docker
• проверь, что новые контейнеры пишут логи ротацией
• убедись, что старые огромные логи не растут дальше

⸻

9. Риски и ограничения
   1. Если диск заполнен почти полностью, prune может освободить мало, потому что образы реально используются или нужны. У тебя reclaimable всего 3.5 гигабайта.
   2. Аварийный шаг “truncate logs” освобождает место быстро, но ты теряешь историю логов. Это приемлемо как emergency.
   3. Единственное полноценное решение на будущее: увеличить диск минимум до 100-120 гигабайт. Автоочистка не заменяет нормальный размер.

⸻

10. Критерии приемки
    1.  На сервере включен таймер mentala-disk-guard.timer и выполняется каждые 10 минут.
    2.  При заполнении >= 85 процентов приходит WARNING в Telegram.
    3.  При заполнении >= 92 процентов выполняется очистка и приходит CRITICAL с деталями.
    4.  После CRITICAL очистки деплой больше не падает на распаковке слоев при наличии достаточного свободного места.
    5.  Docker логи не растут бесконечно благодаря daemon.json.

⸻

11. Что я считаю правильным прямо сейчас
    • Включить log rotation Docker немедленно.
    • Включить Disk Guard + Telegram немедленно.
    • Увеличить диск в ближайшие сутки. Без увеличения диска ты продолжишь ловить “no space left on device”, просто реже.

⸻

Если хочешь, я адаптирую это ТЗ под твой репозиторий как отдельный файл ops_disk_guard_tz.md и добавлю секцию “Инструкция по откату”, но для этого мне надо знать: ты готов менять /etc/docker/daemon.json с перезапуском Docker прямо сейчас, или хочешь сначала только timer + уведомления без перезапуска.
