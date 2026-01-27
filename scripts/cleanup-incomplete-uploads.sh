#!/bin/bash
# Скрипт для списания незавершённых multipart uploads в Yandex Object Storage.
# Использование:
#   ./scripts/cleanup-incomplete-uploads.sh [опции] [--env-file FILE]
# Аргументы:
#   -b, --bucket NAME   — имя бакета (по умолчанию mentala)
#   -e, --endpoint URL  — эндпоинт Object Storage (по умолчанию https://storage.yandexcloud.net)
#   -f, --env-file FILE — загрузить переменные окружения из файла перед запуском
#   -y, --yes           — пропустить подтверждение удаления (удобно для скриптов)
#   -h, --help          — показать справку

set -euo pipefail

BUCKET_NAME="${BUCKET_NAME:-mentala}"
ENDPOINT_URL="${ENDPOINT_URL:-https://storage.yandexcloud.net}"
AUTO_CONFIRM=false
ENV_FILE=""

print_usage() {
  cat <<'EOF'
Использование: scripts/cleanup-incomplete-uploads.sh [опции]
Опции:
  -b, --bucket NAME        Дополнительное имя бакета (по умолчанию mentala)
  -e, --endpoint URL       URL Yandex Object Storage (по умолчанию https://storage.yandexcloud.net)
  -f, --env-file PATH      Загрузить переменные окружения из файла перед запуском
  -y, --yes, --auto, --force  Удалять сразу без запроса подтверждения
  -h, --help               Показать справку
EOF
}

while (( "$#" )); do
  case "$1" in
    -b|--bucket)
      if [ $# -lt 2 ]; then
        echo "❌ Не задано имя бакета"
        print_usage
        exit 1
      fi
      BUCKET_NAME="$2"
      shift 2
      ;;
    --bucket=*)
      BUCKET_NAME="${1#*=}"
      shift
      ;;
    -e|--endpoint)
      if [ $# -lt 2 ]; then
        echo "❌ Не задан эндпоинт"
        print_usage
        exit 1
      fi
      ENDPOINT_URL="$2"
      shift 2
      ;;
    --endpoint=*)
      ENDPOINT_URL="${1#*=}"
      shift
      ;;
    -f|--env-file)
      if [ $# -lt 2 ]; then
        echo "❌ Не задан файл переменных окружения"
        print_usage
        exit 1
      fi
      ENV_FILE="$2"
      shift 2
      ;;
    --env-file=*)
      ENV_FILE="${1#*=}"
      shift
      ;;
    -y|--yes|--auto|--force)
      AUTO_CONFIRM=true
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "❌ Неизвестная опция: $1"
      print_usage
      exit 1
      ;;
  esac
done

echo "🧹 Очистка незавершённых multipart uploads в бакете: $BUCKET_NAME"

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
    return 0
  fi
  return 1
}

maybe_load_env() {
  if [ -n "${ACCESS_KEY_ID:-}" ] && [ -n "${SECRET_ACCESS_KEY:-}" ]; then
    return
  fi

  if [ -n "$ENV_FILE" ]; then
    if load_env_from_file "$ENV_FILE"; then
      return
    fi
    echo "⚠️  Не удалось загрузить: $ENV_FILE"
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
  echo "   Можно экспортировать из .env: source .env.development"
  exit 1
fi

collect_uploads() {
  local key_marker=""
  local upload_id_marker=""
  local is_truncated=true
  local uploads=()

  while :; do
    local cmd=(aws s3api list-multipart-uploads --bucket "$BUCKET_NAME" --endpoint-url "$ENDPOINT_URL" --output json)
    if [ -n "$key_marker" ]; then
      cmd+=(--key-marker "$key_marker" --upload-id-marker "$upload_id_marker")
    fi

    local response
    response="$("${cmd[@]}")"

    while IFS= read -r line; do
      uploads+=("$line")
    done < <(echo "$response" | jq -r '.Uploads[]? | "\(.Key)\u001f\(.UploadId)"')

    is_truncated=$(echo "$response" | jq -r '.IsTruncated // false')
    if [ "$is_truncated" != "true" ]; then
      break
    fi

    key_marker=$(echo "$response" | jq -r '.NextKeyMarker // empty')
    upload_id_marker=$(echo "$response" | jq -r '.NextUploadIdMarker // empty')
    if [ -z "$key_marker" ]; then
      break
    fi
  done

  printf '%s\n' "${uploads[@]}"
}

echo "📋 Поиск незавершённых загрузок..."
UPLOAD_LINES=()
while IFS= read -r line; do
  UPLOAD_LINES+=("$line")
done < <(collect_uploads)

UPLOAD_COUNT="${#UPLOAD_LINES[@]}"

if [ "$UPLOAD_COUNT" -eq 0 ]; then
  echo "✅ Незавершённых загрузок не найдено"
  exit 0
fi

echo "⚠️  Найдено незавершённых загрузок: $UPLOAD_COUNT"
echo ""
echo "Список незавершённых загрузок:"
for raw in "${UPLOAD_LINES[@]}"; do
  IFS=$'\x1f' read -r key upload_id <<< "$raw"
  echo "  - $key (ID: $upload_id)"
done

if [ "$AUTO_CONFIRM" != true ]; then
  echo ""
  read -rp "Удалить все незавершённые загрузки? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Отменено"
    exit 0
  fi
fi

echo ""
for raw in "${UPLOAD_LINES[@]}"; do
  IFS=$'\x1f' read -r key upload_id <<< "$raw"
  echo "🗑️  Удаление: $key (ID: $upload_id)"
  aws s3api abort-multipart-upload \
    --bucket "$BUCKET_NAME" \
    --key "$key" \
    --upload-id "$upload_id" \
    --endpoint-url "$ENDPOINT_URL" \
    --output json > /dev/null 2>&1 || echo "  ⚠️  Не удалось удалить: $key"
done

echo ""
echo "✅ Очистка завершена"
