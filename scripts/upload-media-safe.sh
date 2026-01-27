#!/bin/bash
# Безопасная загрузка медиа в Yandex Object Storage с проверкой и очисткой multipart uploads.
# Использование: ./scripts/upload-media-safe.sh [source_dir] [bucket] [prefix]

set -euo pipefail

SOURCE_DIR="${1:-public/meditations}"
BUCKET_NAME="${2:-mentala}"
PREFIX="${3:-meditations}"
ENDPOINT_URL="https://storage.yandexcloud.net"
UPLOAD_ENV_FILE="${UPLOAD_ENV_FILE:-}"
LOADED_ENV_FILE=""

echo "📤 Загрузка медиа в Yandex Object Storage"
echo "   Источник: $SOURCE_DIR"
echo "   Бакет: $BUCKET_NAME"
echo "   Префикс: $PREFIX"

for tool in aws jq; do
  if ! command -v "$tool" &> /dev/null; then
    echo "❌ $tool не найден. Установите его перед запуском ${tool^}"
    exit 1
  fi
done

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

maybe_load_env

if [ -z "${ACCESS_KEY_ID:-}" ] || [ -z "${SECRET_ACCESS_KEY:-}" ]; then
  echo "❌ Не заданы ACCESS_KEY_ID и SECRET_ACCESS_KEY"
  echo "   Можно экспортировать переменные из .env: source .env.development"
  exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ Директория не найдена: $SOURCE_DIR"
  exit 1
fi

CLEANUP_ARGS=()
if [ -n "$LOADED_ENV_FILE" ]; then
  CLEANUP_ARGS+=(--env-file "$LOADED_ENV_FILE")
fi

echo ""
echo "🧹 Очистка незавершённых загрузок перед началом..."
INCOMPLETE_COUNT=$(aws s3api list-multipart-uploads \
  --bucket "$BUCKET_NAME" \
  --endpoint-url "$ENDPOINT_URL" \
  --output json | jq '.Uploads | length // 0')

if [ "$INCOMPLETE_COUNT" -gt 0 ]; then
  echo "⚠️  Найдено $INCOMPLETE_COUNT незавершённых загрузок. Очищаем..."
  if ! bash scripts/cleanup-incomplete-uploads.sh --bucket "$BUCKET_NAME" --endpoint "$ENDPOINT_URL" --yes "${CLEANUP_ARGS[@]}"; then
    echo "  ⚠️  Очистка завершилась с ошибкой, продолжаем с осторожностью"
  fi
else
  echo "✅ Незавершённых загрузок не найдено"
fi

echo ""
echo "📤 Начинаем загрузку..."

# Используем aws s3 sync с настройками для надёжной загрузки
# --storage-class STANDARD - стандартный класс хранения
# --metadata-directive COPY - копируем метаданные
# --exclude - исключаем служебные файлы
aws s3 sync "$SOURCE_DIR" "s3://$BUCKET_NAME/$PREFIX" \
  --endpoint-url "$ENDPOINT_URL" \
  --acl public-read \
  --storage-class STANDARD \
  --exclude "*.DS_Store" \
  --exclude "**/.DS_Store" \
  --exclude "**/.git/*" \
  --exclude "**/.gitignore" \
  --delete

echo ""
echo "✅ Загрузка завершена"

echo ""
echo "🔍 Проверка незавершённых загрузок после загрузки..."
FINAL_INCOMPLETE=$(aws s3api list-multipart-uploads \
  --bucket "$BUCKET_NAME" \
  --endpoint-url "$ENDPOINT_URL" \
  --output json | jq '.Uploads | length // 0')

if [ "$FINAL_INCOMPLETE" -gt 0 ]; then
  echo "⚠️  ВНИМАНИЕ: После загрузки осталось $FINAL_INCOMPLETE незавершённых загрузок"
  echo "   Запустите: pnpm cleanup:incomplete-uploads"
else
  echo "✅ Все загрузки завершены успешно"
fi
