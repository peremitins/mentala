<template>
  <div
    class="flex h-dvh flex-col space-y-2 overflow-y-auto rounded-lg pb-[100px]"
  >
    <PageHeader
      title="Выгрузка мыслей"
      :show-back-button="true"
      @go-back="handleBack"
    >
      <template #custom>
        <div class="flex min-w-0 items-center gap-2">
          <h1 class="text-xl font-bold text-foreground truncate">
            Выгрузка мыслей
          </h1>
          <button
            v-tooltip="thoughtDumpHelpTooltip"
            type="button"
            class="mt-[1px] inline-flex h-5 w-5 flex-shrink-0 !cursor-default select-none items-center justify-center rounded-full border border-white/25 bg-black/30 text-[11px] font-semibold leading-none text-foreground/90"
            aria-label="О практике «Выгрузка мыслей»"
          >
            ?
          </button>
        </div>
      </template>
    </PageHeader>

    <section class="glass-deep thought-dump-enter min-h-0 flex-1 overflow-auto">
      <div class="mx-auto flex h-full w-full flex-col gap-4 p-5">
        <div class="space-y-1">
          <p class="text-sm text-foreground/75">
            Пиши как есть. Это безопасное пространство.
          </p>
        </div>

        <div class="flex flex-wrap gap-2 flex-shrink-0 overflow-auto">
          <button
            v-for="chip in chips"
            :key="chip.id"
            type="button"
            class="rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-all duration-200 active:scale-[0.98] active:border-primary-ui active:bg-primary-ui/15"
            :class="
              selectedChipId === chip.id
                ? 'border-primary-ui bg-primary-ui/20 text-foreground shadow-sm'
                : 'border-border/60 bg-transparent text-surface-inactive-foreground hover:border-primary-ui hover:bg-transparent hover:text-foreground'
            "
            @click="insertChip(chip)"
          >
            {{ chip.chipText }}
          </button>
        </div>

        <div
          class="relative h-full min-h-[160px] pb-[40px] overflow-hidden rounded-2xl border border-white/15 bg-black/20"
        >
          <textarea
            ref="textareaRef"
            v-model="thoughtText"
            class="min-h-[260px] h-full w-full resize-none bg-transparent px-4 py-4 pb-[30px] text-sm text-foreground outline-none placeholder:text-foreground/45"
            :class="isClearing ? 'thought-dump-clear-text' : ''"
            :maxlength="MAX_TEXT_LENGTH"
            :placeholder="currentPlaceholder"
          />
          <div
            class="pointer-events-none absolute left-2 bottom-2 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[11px] font-medium text-foreground/70"
          >
            {{ textLength }}/{{ MAX_TEXT_LENGTH }}
          </div>
          <button
            type="button"
            class="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground transition hover:border-white/25 hover:bg-white/10"
            :class="
              isListening
                ? 'ring-2 ring-red-400/60 bg-red-500/15 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                : ''
            "
            aria-label="Запись голоса"
            :aria-pressed="isListening"
            @click="toggleMic"
          >
            <IconMic class="h-4 w-4" />
          </button>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <!-- <div class="flex items-center gap-2"> -->
          <Button
            variant="outline"
            class="rounded-full w-auto flex-1"
            :disabled="!thoughtText.trim()"
            @click="clearThoughts"
          >
            Стереть
          </Button>
          <!-- </div> -->

          <Button
            class="rounded-full w-auto flex-1"
            :disabled="!thoughtText.trim()"
            @click="handoffToChat"
          >
            Поговорить об этом
          </Button>
        </div>
      </div>
    </section>

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import IconMic from '~icons/lucide/mic';
import { Button } from '@/app/components/ui/button';
import PageHeader from '@/app/components/PageHeader.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { navigateTo } from '#app';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useToast } from '@/app/composables/useToast';
import { useChatStore } from '@/app/stores/chat';
import { useVoiceDictationInput } from '@/app/composables/useVoiceDictationInput';
import { useBreathPracticeHaptics } from '@/app/composables/useBreathPracticeHaptics';
import { isDocumentAvailable } from '@/app/utils/document';
import { usePlatform } from '@/app/composables/usePlatform';

const MAX_TEXT_LENGTH = 10_000;
const MAX_CHAT_HANDOFF_LENGTH = 1_200;
const DEFAULT_PLACEHOLDER = 'Начни с одной фразы. Например: «Меня тревожит...»';
const THOUGHT_DUMP_HELP_TOOLTIP_TEXT =
  'Свободное выражение мыслей и чувств используется в психологических практиках для снижения эмоционального напряжения. Здесь можно выговориться и выплеснуть то, что накопилось. Даже несколько минут помогают прожить накопленные эмоции и почувствовать облегчение';
const chips = [
  {
    id: 'anxious',
    chipText: 'Меня тревожит, что...',
    textareaText: 'Меня тревожит, что',
  },
  {
    id: 'angry',
    chipText: 'Я злюсь, потому что...',
    textareaText: 'Я злюсь, потому что',
  },
  {
    id: 'scared',
    chipText: 'Мне страшно, что...',
    textareaText: 'Мне страшно, что',
  },
  {
    id: 'tired',
    chipText: 'Я устал от...',
    textareaText: 'Я устал от',
  },
  {
    id: 'ruminating',
    chipText: 'Я не могу перестать думать о...',
    textareaText: 'Я не могу перестать думать о',
  },
  {
    id: 'need',
    chipText: 'Мне сейчас нужно...',
    textareaText: 'Мне сейчас нужно',
  },
  {
    id: 'feel',
    chipText: 'Я чувствую...',
    textareaText: 'Я чувствую',
  },
  {
    id: 'hardest',
    chipText: 'Самое тяжёлое сейчас...',
    textareaText: 'Самое тяжёлое сейчас',
  },
] as const;

type ThoughtDumpChip = (typeof chips)[number];
type ThoughtDumpChipId = ThoughtDumpChip['id'];

const router = useRouter();
const chat = useChatStore();
const { getFeatureAccess } = useEntitlements();
const { platform } = usePlatform();
const { trigger: triggerHaptic } = useBreathPracticeHaptics();

const thoughtText = ref('');
const selectedChipId = ref<ThoughtDumpChipId | null>(null);
const isClearing = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);
const textLength = computed(() => thoughtText.value.length);
const selectedChip = computed(() => {
  if (!selectedChipId.value) return null;
  return chips.find((chip) => chip.id === selectedChipId.value) || null;
});
const currentPlaceholder = computed(() =>
  selectedChip.value
    ? `Продолжи мысль: «${selectedChip.value.chipText}»`
    : DEFAULT_PLACEHOLDER
);
const chatHandoffAccess = computed(() => getFeatureAccess('sos.chat_handoff'));
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);
// Единый tooltip-конфиг: hover/focus для desktop и tap/click для mobile.
const thoughtDumpHelpTooltip = {
  content: THOUGHT_DUMP_HELP_TOOLTIP_TEXT,
  triggers: ['hover', 'focus', 'click'],
  placement: 'bottom-start',
  distance: 10,
  overflowPadding: 16,
  popperClass: 'landing-tooltip-theme',
};

const {
  isListening,
  toggleListening: toggleMic,
  stopListening,
  clearBaseText,
} = useVoiceDictationInput({
  getValue: () => thoughtText.value,
  setValue: (value) => {
    thoughtText.value = value.slice(0, MAX_TEXT_LENGTH);
  },
  separator: '\n',
  onStartError: () => {
    useToast('Диктовка недоступна', 'Продолжай ввод вручную.', 'warning');
  },
});

function handleBack() {
  void router.push('/quick-help');
}

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

async function focusTextarea(moveCursorToEnd = false) {
  if (!isDocumentAvailable() || !textareaRef.value) return;

  textareaRef.value.focus();
  if (!moveCursorToEnd) return;

  const cursorPosition = thoughtText.value.length;
  textareaRef.value.setSelectionRange(cursorPosition, cursorPosition);
}

function resetThoughtDumpState() {
  thoughtText.value = '';
  selectedChipId.value = null;
  clearBaseText();
}

async function insertChip(chip: ThoughtDumpChip) {
  let continuation = thoughtText.value;

  // Если ранее был выбран чип, убираем его префикс и ставим новый.
  if (selectedChip.value) {
    const previousPrefix = `${selectedChip.value.textareaText} `;
    if (continuation.startsWith(previousPrefix)) {
      continuation = continuation.slice(previousPrefix.length);
    }
  }

  continuation = continuation.trimStart();
  selectedChipId.value = chip.id;

  const nextValue = continuation
    ? `${chip.textareaText} ${continuation}`
    : `${chip.textareaText} `;
  thoughtText.value = nextValue.slice(0, MAX_TEXT_LENGTH);

  await nextTick();
  await focusTextarea(true);
}

async function clearThoughts() {
  if (!thoughtText.value.trim()) return;

  isClearing.value = true;
  await triggerHaptic();
  await new Promise((resolve) => setTimeout(resolve, 140));
  resetThoughtDumpState();
  isClearing.value = false;
  await focusTextarea();
}

async function handoffToChat() {
  const text = thoughtText.value.trim();
  if (!text) {
    useToast('Нет текста для передачи', 'Сначала добавь пару строк.', 'info');
    return;
  }

  if (!chatHandoffAccess.value.available) {
    openPaywall('sos.chat_handoff');
    return;
  }

  // Ограничиваем handoff-контекст, чтобы не раздувать токены и стоимость.
  const handoffText = text.slice(0, MAX_CHAT_HANDOFF_LENGTH);
  resetThoughtDumpState();

  // Передаем выгрузку как контекст для автозапроса, без показа user-сообщения.
  chat.entryContext = {
    type: 'thought_dump',
    source: 'quick_help_thought_dump',
    dump_text: handoffText,
  };

  await navigateTo({
    path: '/',
    query: {
      screen: 'chat',
    },
  });

  void chat.startConversation();
}

onMounted(async () => {
  // На desktop/web даем автофокус, чтобы старт был быстрее.
  if (platform.value === 'web') {
    await nextTick();
    await focusTextarea();
  }
});

onBeforeRouteLeave(() => {
  resetThoughtDumpState();
  void stopListening();
});

onBeforeUnmount(() => {
  resetThoughtDumpState();
  void stopListening();
});
</script>

<style scoped>
.thought-dump-enter {
  animation: thought-dump-enter 220ms ease-out both;
}

@keyframes thought-dump-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 8px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.thought-dump-clear-text {
  animation: thought-dump-clear-text 160ms ease-out both;
}

@keyframes thought-dump-clear-text {
  from {
    opacity: 1;
    filter: blur(0);
  }
  to {
    opacity: 0;
    filter: blur(1px);
  }
}
</style>
