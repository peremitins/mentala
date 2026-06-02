<template>
  <div class="space-y-3">
    <div
      v-if="prompt"
      class="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm leading-relaxed text-foreground/80"
    >
      <ProgramFormattedPrompt :text="prompt" />
    </div>

    <div
      class="relative min-h-[170px] overflow-hidden rounded-2xl border border-white/15 bg-black/20 pb-[44px]"
    >
      <textarea
        :value="modelValue"
        class="min-h-[170px] w-full resize-none bg-transparent px-4 py-4 pb-10 text-sm text-foreground outline-none placeholder:text-foreground/45"
        :placeholder="placeholder"
        :maxlength="maxLength"
        @input="handleInput"
      />

      <div
        class="pointer-events-none absolute left-2 bottom-2 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[11px] font-medium text-foreground/70"
      >
        {{ modelValue.length }}/{{ maxLength }}
      </div>

      <button
        type="button"
        class="absolute right-2 bottom-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground transition hover:border-white/25 hover:bg-white/10"
        :class="
          isListening
            ? 'ring-2 ring-red-400/60 bg-red-500/15 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.35)]'
            : ''
        "
        aria-label="Записать голосом"
        :aria-pressed="isListening"
        @click="toggleMic"
      >
        <IconMic class="h-4 w-4" />
      </button>
    </div>

    <MicPermissionDeniedDialog
      :open="showMicDeniedModal"
      :mode="micDeniedDialogMode"
      :is-standalone-pwa="micDeniedIsStandalonePwa"
      @update:open="showMicDeniedModal = $event"
      @open-settings="openMicSettings"
    />
  </div>
</template>

<script setup lang="ts">
import IconMic from '~icons/lucide/mic';
import MicPermissionDeniedDialog from '@/app/components/mic/MicPermissionDeniedDialog.vue';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';
import { useToast } from '@/app/composables/useToast';
import { useVoiceDictationInput } from '@/app/composables/useVoiceDictationInput';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    prompt?: string | null;
    placeholder?: string;
    maxLength?: number;
  }>(),
  {
    prompt: null,
    placeholder: 'Напиши здесь...',
    maxLength: 2000,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'input-method-change', value: 'text' | 'voice' | 'mixed'): void;
}>();

let voiceWasUsed = false;

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value.slice(0, props.maxLength));
  if (voiceWasUsed) {
    emit('input-method-change', 'mixed');
  } else {
    emit('input-method-change', 'text');
  }
}

const {
  isListening,
  toggleListening: toggleMic,
  showMicDeniedModal,
  micDeniedDialogMode,
  micDeniedIsStandalonePwa,
  openMicSettings,
} = useVoiceDictationInput({
  getValue: () => props.modelValue,
  setValue: (value) => {
    voiceWasUsed = true;
    emit('update:modelValue', value.slice(0, props.maxLength));
    emit('input-method-change', 'voice');
  },
  separator: '\n',
  onStartError: () => {
    useToast(
      'Голосовой ввод недоступен',
      'Можно продолжить вводить текст вручную.',
      'warning'
    );
  },
  onFinalTranscription: () => {
    voiceWasUsed = true;
    emit('input-method-change', 'voice');
  },
});
</script>
