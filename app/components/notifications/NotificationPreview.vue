<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  findTemplate,
  getTemplateText,
  type NotificationKind,
  type Addressing,
  type Tone,
  type Directness,
  type HabitSubtype,
} from '@/app/lib/notificationTemplates';

const props = defineProps<{
  kind: NotificationKind;
  addressing: Addressing;
  tone: Tone;
  directness: Directness;
  topicKey?: string;
  habitId?: string;
  subtype?: HabitSubtype;
  userName?: string;
}>();

// Используем composable для определения режима разработки
// Автоматически доступен благодаря Nuxt auto-imports
const isDevelopment = useIsDev();

const previewText = ref('');
const templateId = ref('');

function updatePreview(useFirstTemplate = false) {
  // tone больше не используется в фильтрации шаблонов
  // В production всегда используем первый шаблон (useFirst = true)
  const template = findTemplate(props.kind, {
    topicKey: props.topicKey,
    habitId: props.habitId,
    subtype: props.subtype,
    useFirst: useFirstTemplate || !isDevelopment.value,
  });

  if (template) {
    // addressing используется только для выбора текста (informal/formal)
    previewText.value = getTemplateText(
      template,
      props.addressing,
      props.directness,
      props.userName
    );
    templateId.value = template.id;
  } else {
    previewText.value = 'Время сделать паузу и восстановить дыхание.';
    templateId.value = 'fallback';
  }
}

// Обновляем превью при изменении параметров
// В production используем только первый шаблон (не переключаем)
// tone больше не используется в фильтрации, но оставляем в watch для совместимости
watch(
  () => [
    props.addressing,
    props.tone,
    props.directness,
    props.topicKey,
    props.habitId,
    props.subtype,
  ],
  () => {
    // В production всегда используем первый шаблон
    updatePreview(!isDevelopment.value);
  },
  { immediate: true }
);

// Кнопка "Обновить пример" - только в development
function refreshPreview() {
  if (isDevelopment.value) {
    updatePreview(false);
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Превью уведомления
      </h3>
      <!-- Кнопка "Обновить" только в development режиме -->
      <button
        v-if="isDevelopment"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 transition-all hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
        @click="refreshPreview"
      >
        <span class="text-base">🎲</span>
        <span>Обновить</span>
      </button>
    </div>

    <div
      class="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
    >
      <!-- Фоновый градиент -->
      <div
        class="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-blue-950/20 dark:to-purple-950/20"
      />

      <div class="relative">
        <!-- Иконка и заголовок -->
        <div class="mb-3 flex items-center gap-2">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-sm"
          >
            <span class="text-sm">M</span>
          </div>
          <div class="text-xs font-semibold text-gray-600 dark:text-gray-400">
            Mentai
          </div>
        </div>

        <!-- Текст уведомления -->
        <div
          class="mb-3 text-base leading-relaxed text-gray-900 dark:text-gray-100"
        >
          {{ previewText }}
        </div>

        <!-- Метаинформация - только в development -->
        <div
          v-if="isDevelopment"
          class="flex items-center justify-between text-xs text-gray-500"
        >
          <span>ID: {{ templateId }}</span>
          <span class="opacity-60">Сейчас</span>
        </div>
      </div>
    </div>
  </div>
</template>
