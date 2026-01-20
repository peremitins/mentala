<template>
  <div
    class="flex flex-col items-center justify-center h-full px-4 py-8 space-y-8"
  >
    <!-- Приветственный блок -->
    <div class="text-center space-y-2 animate-fade-in">
      <h1 class="text-3xl font-bold text-foreground">Привет!</h1>
      <p class="text-lg text-white/80">О чём поговорим сейчас?</p>
    </div>

    <!-- Плитки действий -->
    <div class="w-full max-w-md space-y-4">
      <!-- Терапия -->
      <button
        @click="handleSelect('therapy')"
        class="w-full glass-deep bg-card rounded-xl p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group animate-slide-up"
        style="animation-delay: 0.1s; animation-fill-mode: both"
      >
        <div
          class="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
        >
          <IconBrain class="w-6 h-6 text-primary-foreground" />
        </div>
        <div class="flex-1 text-left">
          <div class="text-base font-semibold text-foreground mb-1">
            Терапия
          </div>
          <div class="text-sm text-muted-foreground">
            Обсудить эмоции, тревогу, стресс
          </div>
        </div>
      </button>

      <!-- Привычки -->
      <button
        @click="handleSelect('habits')"
        class="w-full glass-deep rounded-xl p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group animate-slide-up"
        style="animation-delay: 0.2s; animation-fill-mode: both"
      >
        <div
          class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
        >
          <IconListChecks class="w-6 h-6 text-primary-foreground" />
        </div>
        <div class="flex-1 text-left">
          <div class="text-base font-semibold text-foreground mb-1">
            Привычки
          </div>
          <div class="text-sm text-muted-foreground">
            Поддержка, напоминания, прогресс
          </div>
        </div>
      </button>

      <!-- Просто поговорить -->
      <button
        @click="handleSelect('talk')"
        class="w-full glass-deep rounded-xl p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group animate-slide-up"
        style="animation-delay: 0.3s; animation-fill-mode: both"
      >
        <div
          class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
        >
          <IconMessageCircle class="w-6 h-6 text-primary-foreground" />
        </div>
        <div class="flex-1 text-left">
          <div class="text-base font-semibold text-foreground mb-1">
            Просто поговорить
          </div>
          <div class="text-sm text-muted-foreground">Свободный диалог</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import IconBrain from '~icons/lucide/brain';
import IconListChecks from '~icons/lucide/list-checks';
import IconMessageCircle from '~icons/lucide/message-circle';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useChatStore } from '@/app/stores/chat';

const chatSettings = useChatSettingsStore();
const chat = useChatStore();

const emit = defineEmits<{
  (e: 'select', mode: 'therapy' | 'habits' | 'talk', userPrompt: string): void;
}>();

// Конфигурация описаний режимов для передачи в API
const MODE_DESCRIPTIONS = {
  therapy:
    'Пользователь выбрал режим "Терапия" для обсуждения эмоций, тревоги и стресса.',
  habits:
    'Пользователь выбрал режим "Привычки" для поддержки формирования или отказа от привычек.',
  talk: 'Пользователь выбрал свободный диалог без жёсткой темы для эмоциональной разгрузки и общения.',
} as const;

function handleSelect(mode: 'therapy' | 'habits' | 'talk') {
  // Проверяем, что mode валидный
  if (!mode || (mode !== 'therapy' && mode !== 'habits' && mode !== 'talk')) {
    console.error('[WelcomeScreen] Invalid mode:', mode);
    return;
  }

  // Устанавливаем режим (talk мапится на therapy для внутреннего использования)
  if (mode === 'talk') {
    chatSettings.mode = 'therapy';
  } else {
    chatSettings.mode = mode;
  }

  // Сохраняем настройки
  chatSettings.updateChatSettings({ mode: chatSettings.mode }, false);

  // Эмитим событие для родительского компонента с описанием режима
  const description = MODE_DESCRIPTIONS[mode];
  if (!description) {
    console.error('[WelcomeScreen] No description for mode:', mode);
    return;
  }
  emit('select', mode, description);
}
</script>
