#!/bin/bash
# Создаёт базовую структуру каталогов для изображений уведомлений (локально).
# Использование: ./scripts/create-notification-image-structure.sh

set -euo pipefail

LOCAL_ROOT="public/notifications"

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

echo "📂 Создаём локальную структуру в $LOCAL_ROOT"

mkdir -p "$LOCAL_ROOT/common"
for tag in "${COMMON_TAGS[@]}"; do
  mkdir -p "$LOCAL_ROOT/common/$tag"
done

mkdir -p "$LOCAL_ROOT/habits"
for habit in "${HABITS_KEYS[@]}"; do
  for tag in "${HABIT_TAGS[@]}"; do
    mkdir -p "$LOCAL_ROOT/habits/$habit/$tag"
  done
done

echo "✅ Локальная структура создана"
echo "ℹ️  Для создания структуры в Yandex Object Storage используй:"
echo "   ./scripts/create-notification-image-structure.yandex.sh [bucket] [prefix]"
