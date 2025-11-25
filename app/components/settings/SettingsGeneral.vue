<template>
  <div class="space-y-6">
    <!-- Глобальные настройки уведомлений -->
    <section class="space-y-4">
      <!-- Обращение -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Обращение</label>
        <div class="flex gap-3">
          <button
            type="button"
            :class="[
              'flex-1 rounded-lg border px-4 py-2 text-sm transition-colors',
              addressing === 'informal'
                ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            ]"
            @click="addressing = 'informal'"
          >
            ты
          </button>
          <button
            type="button"
            :class="[
              'flex-1 rounded-lg border px-4 py-2 text-sm transition-colors',
              addressing === 'formal'
                ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            ]"
            @click="addressing = 'formal'"
          >
            Вы
          </button>
        </div>
      </div>

      <!-- Тон общения -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Тон общения</label>
        <div class="grid grid-cols-2 gap-2 md:grid-cols-5">
          <button
            v-for="toneOption in toneOptions"
            :key="toneOption.value"
            type="button"
            :class="[
              'rounded-lg border px-3 py-2 text-xs transition-colors',
              tone === toneOption.value
                ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            ]"
            @click="tone = toneOption.value"
          >
            {{ toneOption.label }}
          </button>
        </div>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400">
        Эти параметры влияют на стиль общения AI-ассистента, аватара и текст
        всех уведомлений.
      </p>

      <!-- Кнопка сохранения -->
      <button
        type="button"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="savingGlobal"
        @click="saveGlobalPreferences"
      >
        {{ savingGlobal ? 'Сохранение...' : 'Сохранить' }}
      </button>
    </section>

    <hr class="border-gray-200 dark:border-gray-700" />

    <!-- Остальные настройки -->
    <section class="space-y-3">
      <NuxtLink class="underline opacity-90" to="/privacy">
        Конфиденциальность
      </NuxtLink>
      <VoiceInput />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import VoiceInput from '@/app/components/VoiceInput.vue';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useToast } from '@/app/composables/useToast';
import type { Addressing, Tone } from '@/shared/dto/notifications';

const { fetchGlobalPreferences, updateGlobalPreferences } =
  useNotificationsSettings();

const addressing = ref<Addressing>('informal');
const tone = ref<Tone>('neutral');
const savingGlobal = ref(false);

const toneOptions = [
  { value: 'delicate' as Tone, label: 'Деликатный' },
  { value: 'neutral' as Tone, label: 'Нейтральный' },
  { value: 'uplifting' as Tone, label: 'Воодушевляющий' },
  { value: 'resolute' as Tone, label: 'Решительный' },
  { value: 'demanding' as Tone, label: 'Требовательный' },
];

onMounted(async () => {
  const prefs = await fetchGlobalPreferences();
  if (prefs) {
    addressing.value = prefs.addressing;
    tone.value = prefs.tone;
  }
});

async function saveGlobalPreferences() {
  savingGlobal.value = true;
  const result = await updateGlobalPreferences({
    addressing: addressing.value,
    tone: tone.value,
  });
  savingGlobal.value = false;

  if (result) {
    useToast('Настройки сохранены');
  } else {
    useToast('Ошибка при сохранении');
  }
}
</script>
