<template>
  <div class="space-y-2">
    <div v-if="loading" class="text-sm text-foreground">Загрузка...</div>

    <div v-else class="space-y-2">
      <section class="scroll-mt-24 rounded-lg glass-deep p-4 space-y-3">
        <AssistantToneGrid
          v-model="tone"
          label="Стиль общения"
          description="Эти параметры влияют на стиль общения ИИ-ассистента и AI-тексты уведомлений."
        />
        <p v-if="toneWasUnknown" class="text-xs text-foreground">
          Тон не выбран — сейчас используется спокойный стиль.
        </p>
      </section>

      <section class="scroll-mt-24 rounded-lg glass-deep p-4 space-y-3">
        <ToggleButtonGroup
          v-model="addressing"
          :options="addressingOptions"
          label="Обращение"
          layout="flex"
          size="sm"
          variant="outline"
          item-max-width="200px"
        />
      </section>

      <section class="glass-deep p-3">
        <Button
          type="button"
          class="relative w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSave"
          @click="saveGlobalPreferences"
        >
          <ButtonLoader v-if="savingGlobal" />
          <span :class="savingGlobal ? 'invisible' : ''">Сохранить</span>
        </Button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import ToggleButtonGroup from '@/app/components/ui/ToggleButtonGroup.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { Button } from '@/app/components/ui/button';
import AssistantToneGrid from '@/app/components/settings/AssistantToneGrid.vue';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useToast } from '@/app/composables/useToast';
import type { Addressing, Tone } from '@/shared/dto/notifications';
import { DEFAULT_ASSISTANT_TONE } from '@/shared/constants/assistantTone';

const { fetchGlobalPreferences, updateGlobalPreferences } =
  useNotificationsSettings();

const addressing = ref<Addressing>('informal');
const tone = ref<Tone>(DEFAULT_ASSISTANT_TONE);
const savingGlobal = ref(false);
const toneWasUnknown = ref(false);
const loading = ref(true);
const initialPreferences = ref<{
  addressing: Addressing;
  tone: Tone;
} | null>(null);

const addressingOptions = [
  { value: 'informal' as Addressing, label: 'ты' },
  { value: 'formal' as Addressing, label: 'вы' },
];

onMounted(async () => {
  try {
    const prefs = await fetchGlobalPreferences();
    if (prefs) {
      addressing.value = prefs.addressing;
      if (prefs.tone === 'unknown') {
        toneWasUnknown.value = true;
        tone.value = DEFAULT_ASSISTANT_TONE;
      } else {
        tone.value = prefs.tone;
      }
      initialPreferences.value = {
        addressing: addressing.value,
        tone: tone.value,
      };
    }
  } catch (error) {
    console.error('Не удалось загрузить настройки ассистента:', error);
    useToast('Ошибка', 'Не удалось загрузить настройки', 'error');
  } finally {
    loading.value = false;
  }
});

const isDirty = computed(() => {
  if (!initialPreferences.value) return false;
  return (
    initialPreferences.value.addressing !== addressing.value ||
    initialPreferences.value.tone !== tone.value
  );
});

const canSave = computed(() => {
  return isDirty.value && !savingGlobal.value;
});

async function saveGlobalPreferences() {
  if (!isDirty.value) return;
  savingGlobal.value = true;
  const result = await updateGlobalPreferences({
    addressing: addressing.value,
    tone: tone.value,
  });
  savingGlobal.value = false;

  if (result) {
    toneWasUnknown.value = false;
    initialPreferences.value = {
      addressing: addressing.value,
      tone: tone.value,
    };
    useToast('Настройки сохранены');
  } else {
    useToast('Ошибка при сохранении');
  }
}
</script>
