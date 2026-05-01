# Настройка серверов под zero-downtime деплой

Гайд по тому, что нужно подкрутить руками на dev и prod серверах, чтобы заработала новая схема деплоя из `.github/workflows/deploy-dev.yml` и `deploy-prod.yml`. Делается **один раз**, дальше всё автоматически.

## TL;DR

Ничего критично-нового на серверах разворачивать не надо. Меняется три вещи:

1. **`disk-guard` переезжает в репо** (`scripts/server/disk-guard/`). Сам сервис продолжает работать — обновляется через `install.sh` оттуда.
2. **GitHub Actions перестаёт делать `docker image prune -a -f` перед каждым деплоем** — это убирает ~120 секунд простоя. Контролируемая ротация распределяется между ленивым cleanup в самом workflow, еженедельным `cleanup-docker.yml` и аварийным `disk-guard` на хосте.
3. **В `docker-compose.yml` на сервере** добавляется healthcheck к сервису `web` (опционально — Caddy + blue-green для нулевого downtime).

В `.env.development` / `.env.production` в репо ничего менять **не нужно** (их в репо вообще нет). Все правки — на сервере: либо в `/opt/mentala/{dev,prod}/.env`, либо в `/etc/mentala/telegram.env`. Подробности ниже.

---

## Архитектура чистки диска (после правок)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Уровень    │ Кто                       │ Когда                     │
├────────────┼───────────────────────────┼───────────────────────────┤
│ Текущий    │ deploy-{dev,prod}.yml     │ Каждый push в dev/main    │
│ деплой     │ light cleanup (no -a)     │                           │
│            │ + точечно старые теги     │                           │
├────────────┼───────────────────────────┼───────────────────────────┤
│ Плановое   │ cleanup-docker.yml        │ Вс 04:00 UTC              │
│ ТО (GHA)   │ image prune без -a        │ + ручной workflow_dispatch│
│            │ + builder cache до 2 GB   │                           │
├────────────┼───────────────────────────┼───────────────────────────┤
│ Аварийный  │ mentala-disk-guard.timer  │ Каждые 10 мин на хосте.   │
│ (host)     │ scripts/server/disk-guard │ Срабатывает только при    │
│            │ WARN ≥85%, CRIT ≥92%      │ used ≥ порог.             │
└─────────────────────────────────────────────────────────────────────┘
```

**Активные контейнеры (web, postgres, redis) не затрагиваются ни одним уровнем.** Ни `image prune`, ни `volume prune` не трогают то, что прицеплено к работающим контейнерам — это поведение Docker, не моё.

---

## Файлы env: что где живёт

| Файл | Где | Кто читает | Что внутри | Менять для этой задачи? |
|---|---|---|---|---|
| `.env.development`, `.env.production` | локальная машина (gitignored) | `pnpm dev` локально | твои локальные dev-переменные | ❌ нет |
| `/opt/mentala/{dev,prod}/.env` | на серверах | контейнер `web` (Nuxt/Nitro) | `DATABASE_URL`, `APP_IMAGE`, `TELEGRAM_ALERTS_*`, и т.д. | ⚠️ только если идёшь на уровень 1: добавить `DEPLOY_STRATEGY=bluegreen` |
| `/etc/mentala/telegram.env` | на серверах | `mentala-disk-guard.service` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_THREAD_ID` | ❌ уже заполнен и работает, install.sh его не трогает |

**Telegram-токены могут отличаться между файлами**: приложение читает свои `TELEGRAM_ALERTS_*` (там app-уровневые алерты — 5xx-spike, push degradation), disk-guard читает свои `TELEGRAM_*`. Это могут быть один и тот же бот в одном чате, или разные. Не важно — workflow и disk-guard работают независимо.

---

## Что делать на каждом сервере

### Шаг 0. Перенос disk-guard под управление репо

Сейчас `mentala-disk-guard.sh` живёт прямо на сервере, не версионируется. Его в неизменном виде положили в `scripts/server/disk-guard/` репозитория. После выкатки этих правок на dev/prod нужно один раз перепрошить установленные файлы, чтобы они стали идентичными версиям из репо.

**Что важно:** install.sh идемпотентен и не перезаписывает `/etc/mentala/telegram.env`. Твои текущие токены и chat-id останутся.

#### 0.1. Залить файлы репо на сервер

`mentala-yc-dev` и `mentala-yc-prod` — это алиасы на **один и тот же сервер** (`158.160.94.97`). disk-guard — системный сервис (systemd), живёт на уровне хоста, не на уровне окружения. Поэтому rsync и install.sh нужно выполнить **один раз**:

```bash
rsync -avz --delete \
  scripts/server/disk-guard/ \
  mentala-yc-dev:/tmp/disk-guard/
```

#### 0.2. На сервере прогнать install.sh

```bash
ssh mentala-yc-dev
cd /tmp/disk-guard
sudo ./install.sh             # перезапишет скрипт и unit-файлы, .env НЕ трогает
sudo ./install.sh --status    # убедиться что таймер активный (Active: active (waiting))
sudo ./install.sh --run-once  # принудительный запуск с FORCE_NOTIFY=1 — должно прийти TG-сообщение
rm -rf /tmp/disk-guard
exit
```

Отдельно на prod-сервере делать **не нужно** — это тот же хост.

После `--run-once` в Telegram должно прийти `✅ Mentala. Диск в норме` (так как used=11%). Это подтверждает, что:
- скрипт установлен корректно;
- токен в `/etc/mentala/telegram.env` валидный;
- бот добавлен в чат.

Если не пришло — смотри `journalctl -u mentala-disk-guard.service --since "10 min ago"` для диагностики.

#### 0.3. Если когда-то нужно будет обновить

Любые правки в `scripts/server/disk-guard/` после слияния в `main` ставятся на сервер тем же `rsync` + `sudo ./install.sh`. История изменений видна в git.

---

### Шаг 1. Уровень 0 — healthcheck в docker-compose (минимум)

Открой `/opt/mentala/dev/docker-compose.yml` (на prod — `/opt/mentala/prod/docker-compose.yml`) и в сервисе `web` добавь:

```yaml
  web:
    image: ${APP_IMAGE}
    # ... твои существующие env, depends_on, volumes, ports ...
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--spider", "--tries=1", "http://127.0.0.1:3000/api/health"]
      interval: 10s
      timeout: 3s
      start_period: 30s
      retries: 5
```

> ⚠️ **Важный порядок!** До того, как ты пушнешь это в `docker-compose.yml`, нужно выкатить новый образ `web` с эндпоинтом `/api/health`. То есть сначала push в `dev`-ветку → дожидаешься, что workflow задеплоил образ → только потом правишь compose-файл и перезапускаешь web.
>
> Если сделать наоборот — старый образ не имеет `/api/health`, healthcheck вечно `unhealthy`, deploy-workflow с новым кодом будет ждать healthy и завершит деплой по таймауту.

После правки compose-файла вручную не перезапускай — следующий push в dev/main всё перезапустит. Если хочешь применить сейчас:

```bash
cd /opt/mentala/dev
docker compose up -d --no-deps web
docker compose ps   # проверить что Status: healthy
```

С этим уже:
- `image prune -a -f` исчез из pre-deploy → pull тянет diff (~5–15 МБ);
- workflow ждёт `healthy` перед завершением → не закроет успешно неподнявшийся контейнер;
- при провале healthcheck — авто-rollback на предыдущий digest;
- TG-уведомление о результате каждого деплоя.

Простой ~5–10 секунд на деплой (старт Nitro). Этого хватает в 90% случаев.

---

### Шаг 2 (опционально). Уровень 1 — zero-downtime через blue/green

> ⚠️ **Важно:** реверс-прокси здесь — **Traefik**, а не nginx. Caddy не нужен — Traefik сам балансирует между контейнерами через Docker-сеть `proxy`. Когда `--scale web=2`, Traefik автоматически видит оба контейнера и роутит на них. Единственное что нужно — убрать `container_name` у `web`, потому что Docker не может запустить два контейнера с одинаковым именем.

#### 2.1. Убрать `container_name` из сервиса `web`

В `/opt/mentala/dev/docker-compose.yml` и `/opt/mentala/prod/docker-compose.yml` найди строку:

```yaml
    container_name: mentala-web-dev   # (или mentala-web-prod на prod)
```

и удали её. Больше ничего в compose-файлах менять не нужно — `ports`, `volumes`, `networks`, `labels` остаются как есть.

#### 2.2. Обновить `.env`

```bash
echo 'DEPLOY_STRATEGY=bluegreen' >> /opt/mentala/dev/.env
echo 'DEPLOY_STRATEGY=bluegreen' >> /opt/mentala/prod/.env
```

Без этой переменной workflow использует обычный recreate (с healthcheck-ожиданием и rollback'ом). С `bluegreen` — поднимает второй контейнер, ждёт healthy, потом убирает старый. Traefik всё время роутит запросы на живые контейнеры.

#### 2.3. Первичный накат

После правки compose-файла вручную пересоздай web один раз:

```bash
# dev
cd /opt/mentala/dev
docker compose up -d --no-deps --force-recreate web
docker compose ps   # Status: healthy

# prod
cd /opt/mentala/prod
docker compose up -d --no-deps --force-recreate web
docker compose ps   # Status: healthy
```

Дальше деплои через push идут по blue/green — без даунтайма.

#### 2.4. Откат

Убери `DEPLOY_STRATEGY=bluegreen` из `.env` — workflow перейдёт обратно в recreate-режим.

---

## Telegram-уведомления

### Кто что шлёт

| Источник | Чат | Условие | Пример |
|---|---|---|---|
| `disk-guard.sh` (host) | из `/etc/mentala/telegram.env` | смена state OK↔WARN↔CRIT, либо repeat-окно | `🚨 Mentala. Критично. Диск почти заполнен` |
| `deploy-{dev,prod}.yml` | из `TELEGRAM_ALERTS_*` в `/opt/mentala/*/.env` | каждый деплой | `✅ Deploy success`, `❌ Deploy FAILED`, `🔁 Rolled back` |
| `cleanup-docker.yml` | то же | weekly + ручной запуск | `🧹 Docker cleanup` |
| Приложение (Nitro) | то же | 5xx spike, push degradation, etc. | `🚨 5xx spike` |

### Нужно ли куда-то добавлять переменные?

**Если у тебя приложение уже шлёт ops-алерты в Telegram** (5xx-spike и т.д. приходят) — значит `NUXT_TELEGRAM_ALERTS_BOT_TOKEN` и `NUXT_TELEGRAM_ALERTS_CHAT_ID` в `/opt/mentala/*/.env` **уже есть**. Тогда мои workflow подхватят их автоматически. Ничего добавлять не надо.

**Если приложение алерты не шлёт** — добавь в `/opt/mentala/{dev,prod}/.env`:

```env
NUXT_TELEGRAM_ALERTS_BOT_TOKEN=<тот же токен что у disk-guard>
NUXT_TELEGRAM_ALERTS_CHAT_ID=<тот же chat id>
```

Можно использовать те же значения, что в `/etc/mentala/telegram.env`. Уведомления о деплое и cleanup пойдут в тот же чат, что и алерты disk-guard. Удобно — все ops-сообщения в одном месте.

### Тестовая проверка

На сервере:

```bash
cd /opt/mentala/dev
TG_TOKEN=$(grep -E '^NUXT_TELEGRAM_ALERTS_BOT_TOKEN=' .env | cut -d= -f2- | tr -d '"')
TG_CHAT=$(grep -E '^NUXT_TELEGRAM_ALERTS_CHAT_ID=' .env | cut -d= -f2- | tr -d '"')
[ -z "$TG_TOKEN" ] && echo "❌ NUXT_TELEGRAM_ALERTS_BOT_TOKEN не найден в .env" || echo "✓ token есть"
[ -z "$TG_CHAT" ] && echo "❌ NUXT_TELEGRAM_ALERTS_CHAT_ID не найден в .env" || echo "✓ chat есть"

# Если оба есть — тестовая отправка
curl -fsS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -d "chat_id=${TG_CHAT}" --data-urlencode "text=🧪 ping from $(hostname) $(date -u)"
```

Аналогично для prod.

---

## Чек-лист

### Шаг 0. disk-guard в git (обязательно)
- [ ] `rsync -avz --delete scripts/server/disk-guard/ mentala-yc-dev:/tmp/disk-guard/`
- [ ] `ssh mentala-yc-dev` → `cd /tmp/disk-guard && sudo ./install.sh`
- [ ] `sudo ./install.sh --status` → `Active: active (waiting)`
- [ ] `sudo ./install.sh --run-once` → пришло TG-сообщение `✅ Mentala. Диск в норме`
- [ ] _(на prod отдельно не нужно — dev и prod на одном хосте)_

### Шаг 1. Уровень 0 — healthcheck (обязательно)
- [ ] Push текущих изменений в ветку `dev` → workflow выкатил образ с `/api/health`
- [ ] Открыть `https://dev.mentala.app/api/health` → `{ok:true,ts:...}`
- [ ] На dev-сервере: добавить `healthcheck` и `restart: unless-stopped` к `web` в `docker-compose.yml`
- [ ] `docker compose up -d --no-deps web` → `docker compose ps` показывает `healthy`
- [ ] Push в `main` → проверка тех же шагов на prod

### Шаг 2. Уровень 1 — blue/green через Traefik (опционально)
- [ ] В `/opt/mentala/dev/docker-compose.yml`: убрать строку `container_name: mentala-web-dev` у сервиса `web`
- [ ] В `/opt/mentala/prod/docker-compose.yml`: убрать строку `container_name: mentala-web-prod` у сервиса `web`
- [ ] `echo 'DEPLOY_STRATEGY=bluegreen' >> /opt/mentala/dev/.env`
- [ ] `echo 'DEPLOY_STRATEGY=bluegreen' >> /opt/mentala/prod/.env`
- [ ] На dev: `docker compose up -d --no-deps --force-recreate web` → `docker compose ps` показывает `healthy`
- [ ] На prod: то же самое
- [ ] Следующий push не вызывает downtime — проверить через `while true; do curl -s -o /dev/null -w "%{http_code}\n" https://dev.mentala.app/api/health; sleep 0.2; done` во время деплоя

### Telegram (если ещё не настроено)
- [ ] Проверить что в `/opt/mentala/{dev,prod}/.env` есть `NUXT_TELEGRAM_ALERTS_BOT_TOKEN` и `NUXT_TELEGRAM_ALERTS_CHAT_ID` (если приложение уже шлёт алерты — оба есть)
- [ ] Если нет — добавить, можно использовать те же значения что в `/etc/mentala/telegram.env`
- [ ] Тестовая отправка через curl (см. выше)

---

## Ручной перезапуск (после правок на сервере)

Когда ты что-то изменил руками на сервере — переменную в `.env`, строку в `docker-compose.yml` — нужно пересоздать контейнер. **`docker compose down` для этого не нужен** — он убивает postgres и redis тоже, создавая лишний даунтайм.

### Сценарии

| Что изменил | Команда |
|---|---|
| Переменную в `.env` | `docker compose up -d --no-deps --force-recreate web` |
| Что-то в `docker-compose.yml` | `docker compose up -d --no-deps web` |
| Хочешь принудительно перезапустить с тем же образом | `docker compose up -d --no-deps --force-recreate web` |
| Полный сброс (крайний случай) | `docker compose down && docker compose up -d` |

**`--no-deps`** — не трогает postgres и redis. Без него compose может пересоздать зависимости.

**`--force-recreate`** — пересоздаёт контейнер даже если compose считает что ничего не изменилось. Нужен при правке `.env`, потому что compose не отслеживает содержимое env-файлов — только сам `docker-compose.yml`.

Без `--force-recreate` достаточно при правке `docker-compose.yml` — compose сам видит изменения в файле и пересоздаёт контейнер.

### Проверка после перезапуска

```bash
docker compose ps                    # STATUS: Up (healthy)
docker compose logs web --tail=30    # нет ошибок при старте
```

### Примеры

```bash
# Добавил DEPLOY_STRATEGY=bluegreen в .env
cd /opt/mentala/dev
docker compose up -d --no-deps --force-recreate web

# Поправил healthcheck в docker-compose.yml
cd /opt/mentala/prod
docker compose up -d --no-deps web

# Проверка
docker compose ps
```

---

## FAQ

**Q: Почему `install.sh` не перезаписал мой `/etc/mentala/telegram.env`?**
A: По дизайну. Шаблон `telegram.env.example` копируется только если файла на сервере ещё нет. У тебя он есть и заполнен — install.sh говорит `НЕ перезаписываем (там твои секреты)` и идёт дальше. Это идемпотентность: можешь запускать install.sh хоть каждый день.

**Q: Disk-guard и weekly cleanup-docker.yml не наступят друг другу на пятки?**
A: Нет. Weekly cleanup стартует в 04:00 UTC воскресенья и обычно отрабатывает за минуты. Disk-guard срабатывает раз в 10 минут, но **только при used ≥ 85%**, а после weekly cleanup used обычно низкий. Если по какой-то причине совпадут — оба используют `flock`/`docker compose ps`, повторное удаление того же не приведёт к ошибкам, просто часть команд скажет «нечего чистить».

**Q: Что если disk-guard зачистит образ, который workflow только что pushнул?**
A: `docker image prune -a -f --filter until=72h` удаляет только образы старше 3 дней. Свежий push всегда младше — он защищён фильтром. Кроме того, образ привязан к работающему контейнеру `web` → docker отдельно не даст удалить его.

**Q: Хочу для disk-guard отдельный чат в Telegram. Как?**
A: В `/etc/mentala/telegram.env` уже есть свои `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` — это и так отдельный конфиг. Можешь поменять его на любой другой бот/чат, install.sh туда не лезет. Workflow читает ИЗ ДРУГОГО файла (`/opt/mentala/*/.env` с переменными `TELEGRAM_ALERTS_*`) — настраивается независимо.

**Q: Я хочу временно отключить disk-guard.**
A: `sudo systemctl stop mentala-disk-guard.timer && sudo systemctl disable mentala-disk-guard.timer`. Скрипт и unit-файлы остаются, можно включить обратно через `enable --now`. Полное удаление — `sudo /tmp/disk-guard/install.sh --uninstall`.

**Q: Как поменять пороги (например, поднять CRIT до 95% на prod)?**
A: На сервере: `sudo systemctl edit mentala-disk-guard.service` → добавить
```
[Service]
Environment=CRIT_PCT=95
```
systemd сам положит это в `/etc/systemd/system/mentala-disk-guard.service.d/override.conf` — это локальная тонкая настройка, в git не нужна. Дефолты в репо остаются нетронутыми.

**Q: Можно ли руками заставить cleanup-docker.yml пройтись прямо сейчас?**
A: Да. Локально (с твоей машины):
```bash
gh workflow run cleanup-docker.yml -f target=dev
gh workflow run cleanup-docker.yml -f target=prod
gh workflow run cleanup-docker.yml -f target=both -f aggressive=true   # эквивалент старого prune -a
```

**Q: Постгрес и redis — точно не пострадают?**
A: Нет. `docker volume prune` удаляет только volume'ы без подключённых контейнеров. `redis-data`/`postgres-data` подключены к работающим контейнерам — он их не трогает. Это можно проверить руками: `docker volume ls -f dangling=true`.

**Q: Зачем `--keep-storage 4GB` для билдера?**
A: На сервере билдер не строит образы (build делает GH Actions runner), но небольшой кэш всё равно копится при pull/распаковке. 4 GB — потолок, ниже которого pruning безболезненный.

**Q: Что будет если у меня `sudo` спрашивает пароль?**
A: Это нормально для интерактивных сессий — для них пароль ввести можно. install.sh запрашивает sudo один раз на старте через `require_root`. Workflow в GH Actions заходит как `ubuntu` и **не лезет в `/etc/mentala/telegram.env`** — он читает только `/opt/mentala/*/.env`, у которого права на чтение есть.

**Q: Как работает маршрутизация без Caddy?**
A: Реверс-прокси — Traefik, запущен в Docker в сети `proxy`. Он видит контейнеры через Docker labels и роутит трафик напрямую по внутренней сети — без проброса портов на хост. При `--scale web=2` Traefik автоматически добавляет второй контейнер в балансировку, при `--scale web=1` убирает старый. Ничего настраивать не нужно, кроме удаления `container_name`.
