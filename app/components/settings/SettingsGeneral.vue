<template>
  <div class="space-y-2">
    <div v-if="loading" class="text-sm text-foreground">Загрузка...</div>

    <div v-else class="space-y-2">
      <section class="scroll-mt-24 rounded-lg glass-deep p-4 space-y-3">
        <AssistantToneGrid v-model="tone" label="Стиль общения" />
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

      <section class="scroll-mt-24 rounded-lg glass-deep p-4 space-y-3">
        <p class="text-sm font-medium text-foreground">Голос ассистента</p>

        <ToggleButtonGroup
          v-model="assistantVoiceGender"
          :options="assistantGenderOptions"
          layout="flex"
          size="sm"
          variant="outline"
          item-max-width="200px"
        />

        <div class="space-y-2">
          <button
            v-for="voiceItem in visibleVoiceOptions"
            :key="voiceItem.id"
            type="button"
            class="group relative block w-full overflow-hidden rounded-2xl border px-4 py-4 text-left transition-all duration-200"
            :class="
              assistantVoice === voiceItem.id
                ? 'border-white/40 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                : 'border-white/14 bg-background/20 hover:border-white/24 hover:bg-white/[0.05]'
            "
            @click="assistantVoice = voiceItem.id"
          >
            <p class="text-sm font-semibold text-foreground">
              {{ voiceItem.label }}
            </p>
          </button>
        </div>
      </section>

      <section class="glass-deep p-3">
        <Button
          type="button"
          class="relative w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSave"
          @click="saveAssistantSettings"
        >
          <ButtonLoader v-if="savingGlobal" />
          <span :class="savingGlobal ? 'invisible' : ''">Сохранить</span>
        </Button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ToggleButtonGroup from '@/app/components/ui/ToggleButtonGroup.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { Button } from '@/app/components/ui/button';
import AssistantToneGrid from '@/app/components/settings/AssistantToneGrid.vue';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useToast } from '@/app/composables/useToast';
import { useAuthStore } from '@/app/stores/auth';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import type { Addressing, Tone } from '@/shared/dto/notifications';
import { DEFAULT_ASSISTANT_TONE } from '@/shared/constants/assistantTone';
import {
  DEFAULT_ASSISTANT_VOICE_ID,
  getAssistantVoicesByGender,
  getAssistantVoicePresentation,
  resolveAssistantVoiceCatalogItem,
  resolveAssistantVoiceId,
  type AssistantVoiceGender,
} from '@/shared/constants/assistantVoiceCatalog';

const { fetchGlobalPreferences, updateGlobalPreferences } =
  useNotificationsSettings();
const auth = useAuthStore();
const chatSettings = useChatSettingsStore();
const { locale } = useI18n();

const addressing = ref<Addressing>('informal');
const tone = ref<Tone>(DEFAULT_ASSISTANT_TONE);
const assistantVoice = ref(DEFAULT_ASSISTANT_VOICE_ID);
const assistantVoiceGender = ref<AssistantVoiceGender>('female');
const savingGlobal = ref(false);
const toneWasUnknown = ref(false);
const loading = ref(true);
const initialPreferences = ref<{
  addressing: Addressing;
  tone: Tone;
  assistantVoice: string;
} | null>(null);

const addressingOptions = [
  { value: 'informal' as Addressing, label: 'ты' },
  { value: 'formal' as Addressing, label: 'вы' },
];

const assistantGenderOptions = [
  { value: 'female' as AssistantVoiceGender, label: 'Женский' },
  { value: 'male' as AssistantVoiceGender, label: 'Мужской' },
];

const visibleVoiceOptions = computed(() => {
  return getAssistantVoicesByGender(
    assistantVoiceGender.value,
    auth.user?.locale || locale.value
  );
});

const isGlobalPreferencesDirty = computed(() => {
  if (!initialPreferences.value) return false;
  return (
    initialPreferences.value.addressing !== addressing.value ||
    initialPreferences.value.tone !== tone.value
  );
});

const isAssistantVoiceDirty = computed(() => {
  if (!initialPreferences.value) return false;
  return initialPreferences.value.assistantVoice !== assistantVoice.value;
});

const isDirty = computed(() => {
  return isGlobalPreferencesDirty.value || isAssistantVoiceDirty.value;
});

const canSave = computed(() => {
  return isDirty.value && !savingGlobal.value;
});

watch(assistantVoiceGender, (nextGender) => {
  const selectedVoiceMeta = resolveAssistantVoiceCatalogItem(
    assistantVoice.value
  );
  if (selectedVoiceMeta?.gender === nextGender) {
    return;
  }

  const fallbackVoice = getAssistantVoicesByGender(nextGender)[0];
  if (fallbackVoice) {
    assistantVoice.value = fallbackVoice.id;
  }
});

onMounted(async () => {
  try {
    const [prefs] = await Promise.all([
      fetchGlobalPreferences(),
      chatSettings.getChatSettings().catch((error) => {
        console.error('Не удалось загрузить chat settings:', error);
        return null;
      }),
    ]);

    if (prefs) {
      addressing.value = prefs.addressing;
      if (prefs.tone === 'unknown') {
        toneWasUnknown.value = true;
        tone.value = DEFAULT_ASSISTANT_TONE;
      } else {
        tone.value = prefs.tone;
      }
    }

    const storedVoice = resolveAssistantVoiceId(
      chatSettings.assistantVoice ||
        auth.user?.assistantSettings?.voice ||
        DEFAULT_ASSISTANT_VOICE_ID
    );
    assistantVoice.value = storedVoice;
    assistantVoiceGender.value =
      resolveAssistantVoiceCatalogItem(storedVoice)?.gender || 'female';

    initialPreferences.value = {
      addressing: addressing.value,
      tone: tone.value,
      assistantVoice: storedVoice,
    };
  } catch (error) {
    console.error('Не удалось загрузить настройки ассистента:', error);
    useToast('Ошибка', 'Не удалось загрузить настройки', 'error');
  } finally {
    loading.value = false;
  }
});

async function saveAssistantSettings() {
  if (!isDirty.value) return;

  savingGlobal.value = true;
  let globalSaved = false;
  let voiceSaved = false;

  if (isGlobalPreferencesDirty.value) {
    try {
      const result = await updateGlobalPreferences({
        addressing: addressing.value,
        tone: tone.value,
      });

      if (result) {
        if (auth.user) {
          auth.user.addressing = addressing.value;
        }
        toneWasUnknown.value = false;
        globalSaved = true;
      } else {
        useToast('Ошибка', 'Не удалось сохранить стиль общения', 'error');
      }
    } catch (error) {
      console.error('Не удалось сохранить global preferences:', error);
      useToast('Ошибка', 'Не удалось сохранить стиль общения', 'error');
    }
  }

  if (isAssistantVoiceDirty.value) {
    try {
      await chatSettings.updateChatSettings(
        {
          assistantVoice: assistantVoice.value,
        },
        false
      );

      const selectedVoiceMeta = resolveAssistantVoiceCatalogItem(
        assistantVoice.value
      );
      const selectedVoicePresentation = getAssistantVoicePresentation(
        selectedVoiceMeta,
        auth.user?.locale || locale.value
      );
      if (auth.user && selectedVoiceMeta) {
        auth.user.assistantSettings = {
          voice: selectedVoiceMeta.id,
          voiceLabel: selectedVoicePresentation.label,
          voiceGender: selectedVoiceMeta.gender,
        };
      }
      voiceSaved = true;
    } catch (error) {
      console.error('Не удалось сохранить голос ассистента:', error);
      useToast('Ошибка', 'Не удалось сохранить голос ассистента', 'error');
    }
  }

  savingGlobal.value = false;

  if (!globalSaved && !voiceSaved) {
    return;
  }

  const nextInitial = {
    addressing: globalSaved
      ? addressing.value
      : (initialPreferences.value?.addressing ?? addressing.value),
    tone: globalSaved
      ? tone.value
      : (initialPreferences.value?.tone ?? tone.value),
    assistantVoice: voiceSaved
      ? assistantVoice.value
      : (initialPreferences.value?.assistantVoice ?? assistantVoice.value),
  };
  initialPreferences.value = nextInitial;

  useToast('Настройки сохранены');
}
</script>
