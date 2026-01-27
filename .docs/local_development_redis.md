# Настройка Redis для локальной разработки

## Рекомендация: используй Docker

**Почему Docker:**

- ✅ Единообразие окружения с сервером
- ✅ Легко переключаться между версиями Redis
- ✅ Изолированное окружение (не засоряет систему)
- ✅ Автоматический запуск при `pnpm dev`

## Автоматический запуск Redis

Redis автоматически запускается при выполнении `pnpm dev` через Docker Compose.

**Как это работает:**

1. Скрипт `dev:redis:up` пытается запустить Redis через Docker
2. Скрипт `wait-for-redis.sh` ждёт готовности Redis (до 10 секунд)
3. Если Docker недоступен, проверяется локальный Redis (brew)
4. Только после подтверждения готовности Redis запускается dev сервер

**Важно:** Если Docker не запущен, скрипт покажет предупреждение, но dev сервер всё равно запустится (если Redis доступен локально). В этом случае используй локальный Redis (см. раздел "Альтернативные способы запуска Redis").

## Переход с brew на Docker

Если ты использовал `brew services start redis`, выполни:

```bash
# 1. Останови Redis через brew
pnpm dev:redis:stop-brew
# или вручную:
brew services stop redis

# 2. Убедись, что Docker Desktop запущен

# 3. Запусти dev сервер - Redis запустится автоматически через Docker
pnpm dev
```

После этого Redis будет запускаться автоматически через Docker при каждом `pnpm dev`.

### Использование

1. **Запуск dev сервера (Redis запустится автоматически, если Docker доступен):**

   ```bash
   pnpm dev
   ```

   Если Docker не запущен, увидишь предупреждение:

   ```
   ⚠️  Docker недоступен. Запусти Docker Desktop или используй локальный Redis: brew services start redis
   ```

   В этом случае запусти Redis локально (см. ниже) и продолжи работу.

2. **Ручное управление Redis:**

   ```bash
   # Проверить статус Redis
   pnpm dev:redis:check

   # Запустить Redis (через Docker)
   pnpm dev:redis:up

   # Остановить Redis (Docker)
   pnpm dev:redis:down

   # Перезапустить Redis (Docker)
   pnpm dev:redis:restart

   # Просмотр логов Redis (Docker)
   pnpm dev:redis:logs

   # Остановить Redis через brew (если использовал ранее)
   pnpm dev:redis:stop-brew
   ```

### Переменные окружения

В `.env.development` должны быть указаны:

```bash
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
BULLMQ_ENABLE_WORKERS=true
```

### Альтернативные способы запуска Redis

Если не хочешь использовать Docker, можно установить Redis локально:

**macOS:**

```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**Windows:**
Скачай Redis с [официального сайта](https://redis.io/download) или используй WSL2.

### Проверка работы Redis

После запуска Redis можно проверить подключение:

```bash
# Через Docker
docker compose -f docker-compose.dev.yml exec redis redis-cli ping
# Должно вернуть: PONG

# Или через redis-cli (если установлен локально)
redis-cli ping
# Должно вернуть: PONG
```

### Остановка Redis

Redis автоматически останавливается при остановке dev сервера (Ctrl+C), но контейнер остаётся запущенным.

Чтобы полностью остановить Redis:

```bash
pnpm dev:redis:down
```

### Очистка данных Redis

Если нужно очистить данные Redis:

```bash
# Остановить Redis
pnpm dev:redis:down

# Удалить volume с данными
docker volume rm $(docker volume ls -q | grep redis-data)

# Или удалить все volumes проекта
docker compose -f docker-compose.dev.yml down -v
```
