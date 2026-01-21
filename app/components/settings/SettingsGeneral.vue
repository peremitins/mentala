<template>
  <div class="space-y-6">
    <!-- Глобальные настройки уведомлений -->
    <section class="space-y-4">
      <!-- Блок подписки -->
      <SubscriptionBlock />

      <!-- Обращение -->
      <ToggleButtonGroup
        v-model="addressing"
        :options="addressingOptions"
        label="Обращение"
        layout="flex"
        size="sm"
        variant="outline"
        item-max-width="200px"
      />

      <!-- Тон общения -->
      <ToggleButtonGroup
        v-model="tone"
        :options="toneOptions"
        label="Тон общения"
        size="sm"
        variant="outline"
        description="Эти параметры влияют на стиль общения AI-ассистента и текст всех уведомлений."
        item-max-width="200px"
      />
      <p v-if="toneWasUnknown" class="text-xs text-foreground">
        Тон не выбран — сейчас используется нейтральный.
      </p>

      <!-- Таймер медитации по умолчанию -->
      <ToggleButtonGroup
        v-model="meditationTimerValue"
        :options="meditationTimerOptions"
        label="Таймер медитации по умолчанию"
        size="sm"
        variant="outline"
        description="Используется при запуске медитации (можно изменить перед стартом)."
        item-max-width="200px"
      />

      <!-- Кнопка сохранения -->
      <button
        type="button"
        class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="savingGlobal"
        @click="saveGlobalPreferences"
      >
        {{ savingGlobal ? 'Сохранение...' : 'Сохранить' }}
      </button>
    </section>

    <hr class="border-border" />

    <!-- Остальные настройки -->
    <section class="space-y-3">
      <NuxtLink
        class="underline text-foreground hover:text-primary-ui"
        to="/privacy"
      >
        Конфиденциальность
      </NuxtLink>
      <!-- <VoiceInput /> -->
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import ToggleButtonGroup from '@/app/components/ui/ToggleButtonGroup.vue';
import VoiceInput from '@/app/components/VoiceInput.vue';
import SubscriptionBlock from '@/app/components/settings/SubscriptionBlock.vue';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useToast } from '@/app/composables/useToast';
import type { Addressing, Tone } from '@/shared/dto/notifications';

const { fetchGlobalPreferences, updateGlobalPreferences } =
  useNotificationsSettings();

const addressing = ref<Addressing>('informal');
const tone = ref<Tone>('neutral');
const meditationTimerValue = ref('off');
const savingGlobal = ref(false);
const toneWasUnknown = ref(false);

const addressingOptions = [
  { value: 'informal' as Addressing, label: 'ты' },
  { value: 'formal' as Addressing, label: 'Вы' },
];

const toneOptions = [
  { value: 'delicate' as Tone, label: 'Деликатный' },
  { value: 'neutral' as Tone, label: 'Нейтральный' },
  { value: 'uplifting' as Tone, label: 'Воодушевляющий' },
  { value: 'resolute' as Tone, label: 'Решительный' },
  { value: 'demanding' as Tone, label: 'Требовательный' },
];

const meditationTimerOptions = [
  { value: 'off', label: 'Без таймера' },
  { value: '10', label: '10 мин' },
  { value: '20', label: '20 мин' },
  { value: '30', label: '30 мин' },
];

onMounted(async () => {
  const prefs = await fetchGlobalPreferences();
  if (prefs) {
    addressing.value = prefs.addressing;
    if (prefs.tone === 'unknown') {
      toneWasUnknown.value = true;
      tone.value = 'neutral';
    } else {
      tone.value = prefs.tone;
    }
    // Конвертируем число в строку для ToggleButtonGroup
    meditationTimerValue.value = prefs.meditationTimerMinutes
      ? String(prefs.meditationTimerMinutes)
      : 'off';
  }
});

async function saveGlobalPreferences() {
  savingGlobal.value = true;
  const meditationTimerMinutes =
    meditationTimerValue.value === 'off'
      ? null
      : Number(meditationTimerValue.value);
  const result = await updateGlobalPreferences({
    addressing: addressing.value,
    tone: tone.value,
    meditationTimerMinutes,
  });
  savingGlobal.value = false;

  if (result) {
    toneWasUnknown.value = false;
    useToast('Настройки сохранены');
  } else {
    useToast('Ошибка при сохранении');
  }
}
</script>
