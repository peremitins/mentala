# mentala-disk-guard

Скрипт + systemd-таймер для мониторинга занятости диска на серверах Mentala. Раз в 10 минут проверяет `df`, при достижении порога чистит Docker и журнал, посылает отчёт в Telegram.

Этот каталог — **единый источник правды** для disk-guard. На серверах живут только установленные копии, обновление — через `install.sh` отсюда.

## Когда срабатывает

| Состояние | Условие | Действия | Repeat-окно |
|---|---|---|---|
| `OK` | used < 85% | ничего | — |
| `WARN` | 85% ≤ used < 92% | `docker container/network/builder prune` + `docker image prune -a --filter until=72h` | 60 мин |
| `CRIT` | used ≥ 92% | то же + `until=168h`, `journalctl --vacuum-time=7d`, при необходимости — truncate `*-json.log` | 10 мин |

Уведомление в Telegram приходит при **смене состояния** или по истечении repeat-окна. State хранится в `/var/lib/mentala/disk-guard.state`.

## Файлы

| Файл в репо | Куда ставится | Что |
|---|---|---|
| `disk-guard.sh` | `/usr/local/bin/mentala-disk-guard.sh` (755) | основной скрипт |
| `mentala-disk-guard.service` | `/etc/systemd/system/` (644) | systemd-сервис, oneshot |
| `mentala-disk-guard.timer` | `/etc/systemd/system/` (644) | таймер каждые 10 минут |
| `telegram.env.example` | `/etc/mentala/telegram.env` (600) | **шаблон** — реальные секреты заполняются на сервере один раз |
| `install.sh` | — | установщик, не нужен на сервере как файл |

> Файл `/etc/mentala/telegram.env` хранит токен Telegram-бота и chat-id. **В git коммитить нельзя**. В репо лежит только `.example`.

## Установка / обновление

На сервере (как dev, так и prod) нужно один раз залить файлы из репо. Самый простой способ — выкачать конкретный каталог через `git archive` или просто rsync с локальной машины. Через GH Actions это пока не автоматизировано — disk-guard ставится руками.

### Первичная установка (когда ничего ещё нет)

На локальной машине:
```bash
# Закидываем только эту папку на сервер
rsync -avz scripts/server/disk-guard/ \
  ubuntu@<DEV_SSH_HOST>:/tmp/disk-guard/

ssh ubuntu@<DEV_SSH_HOST>
```

На сервере:
```bash
cd /tmp/disk-guard
sudo ./install.sh                # первичная установка
# Если /etc/mentala/telegram.env создаётся из шаблона — открываем и заполняем:
sudo nano /etc/mentala/telegram.env
sudo ./install.sh                # повторный запуск активирует таймер
sudo ./install.sh --status       # проверяем
sudo ./install.sh --run-once     # принудительно дёрнем со state=OK и FORCE_NOTIFY=1, чтобы убедиться что TG отвечает
rm -rf /tmp/disk-guard
```

### Обновление (когда уже стоит)

Тот же rsync + `sudo ./install.sh`. install.sh идемпотентен:

- Перезапишет `/usr/local/bin/mentala-disk-guard.sh` и unit-файлы.
- Сделает `systemctl daemon-reload`.
- `/etc/mentala/telegram.env` **не трогает** — секреты сохраняются.
- Таймер перезапустит на ходу (`enable --now`).

### Снятие

```bash
sudo ./install.sh --uninstall
```

Удалит unit-файлы и скрипт. `/etc/mentala/telegram.env` и `/var/lib/mentala/` оставит — на случай если хочешь поставить обратно.

## Тонкая настройка порогов

Дефолты вшиты и в `disk-guard.sh`, и в `mentala-disk-guard.service` (через `Environment=`). Если нужно поменять для конкретного сервера без правок в репо — сделай systemd drop-in:

```bash
sudo systemctl edit mentala-disk-guard.service
# в редакторе:
[Service]
Environment=WARN_PCT=80
Environment=CRIT_PCT=88
```

systemd сам положит это в `/etc/systemd/system/mentala-disk-guard.service.d/override.conf` и переопределит дефолты. Это локальная тонкая настройка — в git её не нужно.

## Координация с GitHub Actions

Этот disk-guard — **аварийный механизм**. Он срабатывает только когда диск действительно переполняется. Параллельно работают:

- `deploy-{dev,prod}.yml` — лёгкая очистка (только dangling) перед каждым деплоем + точечное удаление старых тегов после успеха.
- `cleanup-docker.yml` — глубокая зачистка по cron (вс 04:00 UTC) или вручную.

В норме (used < 85%) disk-guard молчит, основную ротацию делают workflow'ы. Если что-то сломалось и диск всё-таки переполнился — disk-guard поймает и почистит автоматически. См. `.docs/server-deployment-setup.md` для общей картины.

## Безопасность коммита

`.gitignore`-чек перед пушем:

```bash
git status --short scripts/server/disk-guard/
```

В этом каталоге **никогда** не должно быть файла `telegram.env` без `.example`. Если случайно попал — отзови токен у `@BotFather` и создай новый.
