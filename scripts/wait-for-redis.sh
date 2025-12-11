#!/bin/bash

# Скрипт ожидания готовности Redis
# Проверяет доступность Redis через Docker или локально

MAX_ATTEMPTS=10
ATTEMPT=0

# Функция проверки Redis через Docker
check_docker_redis() {
  docker compose -f docker-compose.dev.yml exec -T redis redis-cli ping >/dev/null 2>&1
}

# Функция проверки локального Redis
check_local_redis() {
  redis-cli ping >/dev/null 2>&1
}

# Пытаемся проверить через Docker
if docker compose -f docker-compose.dev.yml ps redis >/dev/null 2>&1; then
  echo "⏳ Ожидание готовности Redis (Docker)..."
  while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if check_docker_redis; then
      echo "✅ Redis готов (Docker)"
      exit 0
    fi
    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done
  echo "⚠️  Redis через Docker не отвечает, проверяю локальный Redis..."
fi

# Если Docker Redis не работает, проверяем локальный
if check_local_redis; then
  echo "✅ Redis готов (локальный)"
  exit 0
fi

# Если ничего не работает, выходим с ошибкой
echo "❌ Redis не доступен ни через Docker, ни локально"
exit 1
