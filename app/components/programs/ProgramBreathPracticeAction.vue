<template>
  <div class="xs:space-y-3 space-y-1">
    <!-- Краткая инструкция перед плеером. Embedded-layout BreathPracticePlayer
         не показывает описание практики (это поведение `layout='full'`),
         поэтому без этого блока юзер видит только орб без объяснения что делать.
         Источник: action.prompt из blueprint → fallback на practice.description. -->
    <div
      v-if="instructionText"
      class="glass-deep p-3 text-sm leading-relaxed text-foreground/80"
    >
      {{ instructionText }}
    </div>

    <BreathPracticePlayer
      v-if="practice"
      layout="embedded"
      :practice="practice"
      :session-minutes="roadmapSessionMinutes"
      :show-navigation="false"
      :show-settings="true"
      :show-intro-panel="true"
      :show-completion-overlay="false"
      :overlay-z-index="80"
      @complete="emit('complete')"
      @start="emit('start')"
      @pause="emit('pause')"
      @stop="emit('stop')"
    />

    <div v-else class="glass-deep space-y-1 p-4">
      <p class="text-sm font-medium text-foreground">Практика недоступна</p>
      <p class="text-xs leading-relaxed text-foreground/60">
        Не удалось сопоставить шаг с дыхательной практикой из каталога.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BreathPracticePlayer from '@/app/components/breath-practices/BreathPracticePlayer.vue';
import type { BreathPractice } from '@/app/lib/breathPracticesCatalog';
import { resolveProgramBreathPractice } from '@/app/lib/programBreathPracticeResolver';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

const props = defineProps<{
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'complete'): void;
  (e: 'start'): void;
  (e: 'pause'): void;
  (e: 'stop'): void;
}>();

const practice = computed<BreathPractice | null>(() => {
  return resolveProgramBreathPractice(props.action.template);
});

const instructionText = computed<string | null>(() => {
  const prompt = props.action.prompt?.trim();
  if (prompt) return prompt;
  const description = practice.value?.description?.trim();
  return description || null;
});

const ROADMAP_PRACTICE_SESSION_MINUTES = 60;
const roadmapSessionMinutes = ROADMAP_PRACTICE_SESSION_MINUTES;
</script>
