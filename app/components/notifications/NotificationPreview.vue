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
import { formatNotificationTextWithName } from '@/shared/utils/notificationText';

const props = defineProps<{
  kind: NotificationKind;
  addressing: Addressing;
  tone: Tone;
  directness: Directness;
  entityKey?: string;
  subtype?: HabitSubtype;
  userName?: string;
  customTexts?: string[];
  isAiGenerated?: boolean;
}>();

// Используем composable для определения режима разработки
// Автоматически доступен благодаря Nuxt auto-imports
const isDevelopment = useIsDev();

const previewText = ref('');
const templateId = ref('');

function updatePreview(useFirstTemplate = false) {
  if (props.customTexts?.length && props.customTexts[0]) {
    previewText.value = formatNotificationTextWithName(
      props.customTexts[0],
      props.userName
    );
    templateId.value = 'custom_user_text';
    return;
  }

  // tone больше не используется в фильтрации шаблонов
  // В production всегда используем первый шаблон (useFirst = true)
  const template = findTemplate(props.kind, {
    entityKey: props.entityKey,
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
    props.entityKey,
    props.subtype,
    props.customTexts,
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
      <h3 class="text-sm font-medium text-foreground">Превью уведомления</h3>
      <!-- Кнопка "Обновить" только в development режиме -->
      <button
        v-if="isDevelopment"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-all"
        @click="refreshPreview"
      >
        <span class="text-base">🎲</span>
        <span>Обновить</span>
      </button>
    </div>

    <div
      class="group relative overflow-hidden rounded-xl border border-primary bg-button-active-soft p-5 shadow-sm transition-all duration-300 hover:shadow-md"
    >
      <!-- Фоновый градиент -->
      <div
        class="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div class="relative">
        <!-- Иконка и заголовок -->
        <div class="mb-3 flex items-center gap-2">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary text-primary-foreground shadow-sm"
          >
            <span class="text-sm">M</span>
          </div>
          <div class="text-xs font-semibold text-surface-raised-foreground">
            Mentai
          </div>
        </div>

        <!-- Текст уведомления -->
        <div
          class="mb-3 text-base leading-relaxed text-surface-raised-subtitle"
        >
          <span
            v-if="isAiGenerated"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-button-active-soft text-surface-raised-subtitle text-xs font-medium mr-2"
          >
            <span>✨</span>
            <span>AI</span>
          </span>
          {{ previewText }}
        </div>
      </div>
    </div>
  </div>
</template>
