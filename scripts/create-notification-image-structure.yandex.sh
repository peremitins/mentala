#!/bin/bash
# Создаёт базовую структуру каталогов в Yandex Object Storage (без удаления файлов).
# Использование: ./scripts/create-notification-image-structure.yandex.sh [bucket] [prefix]

set -euo pipefail

BUCKET_NAME="${1:-mentala}"
PREFIX="${2:-notifications}"
ENDPOINT_URL="https://storage.yandexcloud.net"
UPLOAD_ENV_FILE="${UPLOAD_ENV_FILE:-}"
LOADED_ENV_FILE=""

# Теги изображений, которые обязаны существовать в common
COMMON_TAGS=(
  "activity"
  "nature"
  "meditation"
  "daily_life"
  "neutral_abstract"
  "harm_organs"
  "harm_mental"
)

# Сущности habits, для которых допускаются уникальные изображения
HABITS_KEYS=(
  "alcohol"
  "water"
  "steps"
  "meditation"
  "smoking"
  "sugar"
  "nutrition"
)

# Теги, допустимые внутри сущностных habits
HABIT_TAGS=(
  "activity"
  "nature"
  "meditation"
  "daily_life"
  "neutral_abstract"
  "harm_organs"
  "harm_appearance"
  "harm_mental"
)

load_env_from_file() {
  local file="$1"
  if [ -f "$file" ]; then
    echo "📁 Загружаем переменные из $file"
    set -a
    # shellcheck source=/dev/null
    source "$file"
    set +a
    LOADED_ENV_FILE="$file"
    return 0
  fi
  return 1
}

maybe_load_env() {
  if [ -n "${ACCESS_KEY_ID:-}" ] && [ -n "${SECRET_ACCESS_KEY:-}" ]; then
    return
  fi

  if [ -n "$UPLOAD_ENV_FILE" ]; then
    if load_env_from_file "$UPLOAD_ENV_FILE"; then
      return
    fi
    echo "⚠️  Не удалось загрузить: $UPLOAD_ENV_FILE"
  fi

  for candidate in .env.local .env.development .env; do
    if load_env_from_file "$candidate"; then
      return
    fi
  done
}

create_remote_prefix() {
  local key="$1"
  aws s3api put-object \
    --bucket "$BUCKET_NAME" \
    --key "$key" \
    --endpoint-url "$ENDPOINT_URL" \
    --content-length 0 > /dev/null
}

for tool in aws; do
  if ! command -v "$tool" &> /dev/null; then
    echo "❌ $tool не найден. Установи awscli перед запуском."
    exit 1
  fi
done

maybe_load_env

if [ -z "${ACCESS_KEY_ID:-}" ] || [ -z "${SECRET_ACCESS_KEY:-}" ]; then
  echo "❌ Не заданы ACCESS_KEY_ID и SECRET_ACCESS_KEY"
  echo "   Можно экспортировать переменные из .env: source .env.development"
  exit 1
fi

echo "☁️  Создаём структуру в Yandex Object Storage (без удаления файлов)"
echo "   Бакет: $BUCKET_NAME"
echo "   Префикс: $PREFIX"

for tag in "${COMMON_TAGS[@]}"; do
  create_remote_prefix "${PREFIX}/common/${tag}/"
done

for habit in "${HABITS_KEYS[@]}"; do
  for tag in "${HABIT_TAGS[@]}"; do
    create_remote_prefix "${PREFIX}/habits/${habit}/${tag}/"
  done
done

echo "✅ Структура в Object Storage создана"
