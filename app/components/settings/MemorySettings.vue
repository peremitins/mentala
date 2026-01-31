<template>
  <div class="space-y-2">
    <!-- Заголовок блока -->
    <div class="font-medium text-lg">Управление памятью</div>

    <!-- Оптимизация контекста (Previous Response ID) -->
    <div class="space-y-2 max-w-[70ch]">
      <div class="flex items-center justify-between">
        <div class="font-medium">Память ИИ</div>
        <Switch
          :checked="chatSettings.enablePreviousResponseId"
          class="flex-shrink-0"
          :loading="previousResponseIdLoading"
          @update:checked="onPreviousResponseIdChange"
        />
      </div>
      <div class="relative">
        <Transition name="fade" mode="out-in">
          <div
            v-if="chatSettings.enablePreviousResponseId"
            key="enabled"
            class="text-sm opacity-70 space-y-1"
          >
            <p>
              <strong>Включено:</strong> Ассистент временно сохраняет часть
              недавнего диалога на безопасных серверах ИИ-модели, чтобы помнить
              контекст и быстрее отвечать. Данные хранятся ограниченное время,
              обезличены и используются только для улучшения качества беседы.
            </p>
          </div>
          <div v-else key="disabled" class="text-sm opacity-70 space-y-1">
            <p>
              <strong>Выключено:</strong> Ассистент не использует временное
              сохранение контекста. Каждый запрос обрабатывается отдельно, что
              обеспечивает максимальную локальность данных, но может уменьшить
              степень связности диалога.
            </p>
          </div>
        </Transition>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useToast } from '@/app/composables/useToast';
import { Switch } from '@/app/components/ui/shadcn/switch';

const chatSettings = useChatSettingsStore();
const previousResponseIdLoading = ref(false);

onMounted(async () => {
  // Загружаем настройки при монтировании
  try {
    await chatSettings.getChatSettings();
  } catch (error) {
    console.error('Failed to load chat settings:', error);
  }
});

async function onPreviousResponseIdChange(value: boolean) {
  previousResponseIdLoading.value = true;
  try {
    await chatSettings.updateChatSettings({
      enablePreviousResponseId: value,
    });
    useToast(value ? 'Память ИИ включена' : 'Память ИИ выключена');
  } catch (error) {
    console.error('Failed to update enablePreviousResponseId:', error);
    useToast('Ошибка при сохранении настройки');
  } finally {
    previousResponseIdLoading.value = false;
  }
}

</script>
