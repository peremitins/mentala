<template>
  <div class="space-y-6">
    <!-- Заголовок блока -->
    <div class="font-medium text-lg">Управление памятью</div>

    <!-- Оптимизация контекста (Previous Response ID) -->
    <div class="space-y-2 max-w-[70ch]">
      <div class="flex items-center justify-between">
        <div class="font-medium">Память ИИ</div>
        <SwitchRoot
          v-model:checked="chatSettings.enablePreviousResponseId"
          @update:checked="onPreviousResponseIdChange"
          class="w-12 h-6 rounded-full border border-white/15 bg-white/10 backdrop-blur flex items-center px-1 data-[state=checked]:bg-green-500 flex-shrink-0"
        >
          <SwitchThumb
            class="w-4 h-4 bg-white rounded-full transition-transform translate-x-0 data-[state=checked]:translate-x-6"
          />
        </SwitchRoot>
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

    <hr class="border-white/10" />

    <!-- Долгосрочная память (Summary) -->
    <div class="space-y-2 max-w-[70ch]">
      <div class="flex items-center justify-between">
        <div class="font-medium">Память в приложении</div>
        <SwitchRoot
          v-model:checked="chatSettings.enableSummary"
          @update:checked="onSummaryChange"
          class="w-12 h-6 rounded-full border border-white/15 bg-white/10 backdrop-blur flex items-center px-1 data-[state=checked]:bg-green-500 flex-shrink-0"
        >
          <SwitchThumb
            class="w-4 h-4 bg-white rounded-full transition-transform translate-x-0 data-[state=checked]:translate-x-6"
          />
        </SwitchRoot>
      </div>
      <div class="relative">
        <Transition name="fade" mode="out-in">
          <div
            v-if="chatSettings.enableSummary"
            key="enabled"
            class="text-sm opacity-70 space-y-1"
          >
            <p>
              <strong>Включено:</strong> Ассистент создаёт короткие
              зашифрованные резюме прошлых бесед, чтобы мягко учитывать ваши
              предпочтения и историю общения. Это помогает делать ответы более
              персональными, даже спустя недели.
            </p>
          </div>
          <div v-else key="disabled" class="text-sm opacity-70 space-y-1">
            <p>
              <strong>Выключено:</strong> Ассистент не сохраняет резюме и каждый
              новый разговор начинается с нуля. Подходит, если вы предпочитаете
              полностью независимые сессии без учёта предыдущего опыта общения.
            </p>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Информационный блок -->
    <div class="glass-deep p-3 rounded-lg space-y-1">
      <div class="flex items-start gap-2">
        <span class="text-lg">💡</span>
        <div class="flex-1 text-sm opacity-80">
          <strong>Рекомендация:</strong> для более точной и комфортной работы
          ассистента можно включить оба режима. Если для вас важнее максимальная
          конфиденциальность данных, оставьте память выключенной.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { SwitchRoot, SwitchThumb } from 'radix-vue';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useToast } from '@/app/composables/useToast';

const chatSettings = useChatSettingsStore();

onMounted(async () => {
  // Загружаем настройки при монтировании
  try {
    await chatSettings.getChatSettings();
  } catch (error) {
    console.error('Failed to load chat settings:', error);
  }
});

async function onPreviousResponseIdChange(value: boolean) {
  try {
    await chatSettings.updateChatSettings({
      enablePreviousResponseId: value,
    });
    useToast(value ? 'Память ИИ включена' : 'Память ИИ выключена');
  } catch (error) {
    console.error('Failed to update enablePreviousResponseId:', error);
    useToast('Ошибка при сохранении настройки');
  }
}

async function onSummaryChange(value: boolean) {
  try {
    await chatSettings.updateChatSettings({
      enableSummary: value,
    });
    useToast(
      value ? 'Память в приложении включена' : 'Память в приложении выключена'
    );
  } catch (error) {
    console.error('Failed to update enableSummary:', error);
    useToast('Ошибка при сохранении настройки');
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
