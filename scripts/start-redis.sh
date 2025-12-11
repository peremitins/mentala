#!/bin/bash

# Скрипт запуска Redis через Docker с проверкой доступности Docker

if docker info >/dev/null 2>&1; then
  # Docker доступен - запускаем Redis
  docker compose -f docker-compose.dev.yml up -d redis
else
  # Docker недоступен - показываем предупреждение
  echo '⚠️  Docker недоступен. Запусти Docker Desktop или используй локальный Redis: brew services start redis'
  exit 0
fi
