<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      v-if="nextProgram"
      class="glass-deep max-w-md border border-border bg-card text-card-foreground"
    >
      <!-- Приветственный шаг нового Сада: название, краткое описание,
           CTA «Начать новый сад» → transition-анимация роста. -->
      <DialogHeader class="space-y-1">
        <p
          class="text-[11px] font-semibold uppercase tracking-wide text-violet-200"
        >
          Следующий сад
        </p>
        <DialogTitle class="text-xl font-semibold leading-tight">
          {{ nextProgram.title }}
        </DialogTitle>
        <DialogDescription
          v-if="nextProgram.subtitle"
          class="text-sm text-foreground/70"
        >
          {{ nextProgram.subtitle }}
        </DialogDescription>
      </DialogHeader>

      <!-- Краткое описание пути — чего ждать от нового сада. -->
      <section
        v-if="nextProgram.summaryText"
        class="rounded-2xl border border-violet-200/15 bg-violet-200/[0.04] p-3"
      >
        <p
          class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-200"
        >
          О чём этот сад
        </p>
        <p class="text-xs leading-relaxed text-foreground/75">
          {{ nextProgram.summaryText }}
        </p>
      </section>

      <div class="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" @click="onClose">
          Отложить
        </Button>
        <Button
          type="button"
          :disabled="isStarting"
          :aria-busy="isStarting"
          @click="onPlantSeed"
        >
          {{ isStarting ? 'Начинаем…' : 'Начать новый сад' }}
        </Button>
      </div>
    </DialogContent>

    <!-- Transition-анимация роста при клике «Начать новый сад». Полноэкранный
         overlay 2.5s, по завершении navigateTo на map нового Сада.
         Анимация — CSS keyframes (без lottie), цветок — первый момент знакомства
         с растением нового сада. -->
    <Teleport to="body">
      <div v-if="isTransitioning" class="plant-grow-overlay">
        <div class="plant-grow-overlay__bloom" aria-hidden="true" />
        <div class="plant-grow-overlay__seed">
          <img
            v-if="nextProgram"
            :src="nextPlantImage"
            :alt="nextProgram.title"
            class="plant-grow-overlay__image"
          />
        </div>
        <p class="plant-grow-overlay__label">{{ nextProgram?.title }}</p>
      </div>
    </Teleport>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { useAPI } from '@/app/composables/useAPI';
import { getRetentionPlantImageSrc } from '@/app/utils/retentionPlant';
import type {
  GardenAvailableProgramDto,
  GardenPlantItemDto,
} from '@/shared/dto/garden';

const props = defineProps<{
  open: boolean;
  /** Оставлен для обратной совместимости с вызывающим кодом; не используется в UI. */
  previousPlant?: GardenPlantItemDto | null;
  nextProgram: GardenAvailableProgramDto;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'started', programSlug: string): void;
}>();

const router = useRouter();

// Стадия 0 нового растения — используется только в transition-анимации.
const nextPlantImage = computed(() => {
  if (!props.nextProgram.plantSetSlug) return '';
  return getRetentionPlantImageSrc(0, props.nextProgram.plantSetSlug);
});

const isStarting = ref(false);
const isTransitioning = ref(false);

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

function onClose() {
  emit('update:open', false);
}

async function onPlantSeed() {
  if (isStarting.value) return;
  isStarting.value = true;
  try {
    await useAPI<{ ok: true; programSlug: string }>('/api/garden/start', {
      method: 'POST',
      body: { programSlug: props.nextProgram.programSlug },
      suppressErrorToast: true,
    });
    emit('started', props.nextProgram.programSlug);
    // Запускаем transition-анимацию и одновременно готовим переход.
    isTransitioning.value = true;
    setTimeout(() => {
      emit('update:open', false);
      void router.push(`/programs/${props.nextProgram.programSlug}/map`);
    }, 2400);
  } catch (error) {
    console.error('[GardenTransplantHandoff] start failed:', error);
    isStarting.value = false;
  }
}
</script>

<style scoped>
/* Полноэкранный overlay для transition-анимации «семя → росток → цветок».
   3 фазы по ~800ms каждая, easing soft. Параллельно — тёплый glow.
   Не используем lottie/svg, чтобы не тянуть в bundle лишний рантайм. */
.plant-grow-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: radial-gradient(
    circle at center,
    rgba(31, 41, 55, 0.92),
    rgba(15, 23, 42, 0.96)
  );
  animation: overlay-fade-in 320ms ease both;
}

.plant-grow-overlay__bloom {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
      circle at 50% 50%,
      rgba(244, 114, 182, 0.32),
      transparent 40%
    ),
    radial-gradient(
      circle at 30% 70%,
      rgba(167, 243, 208, 0.28),
      transparent 36%
    );
  filter: blur(20px);
  opacity: 0;
  animation: overlay-bloom 2400ms ease both;
}

.plant-grow-overlay__seed {
  position: relative;
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.plant-grow-overlay__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transform: scale(0.2);
  animation: plant-grow 2400ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.plant-grow-overlay__label {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  opacity: 0;
  animation: label-fade 2400ms ease both;
  animation-delay: 1400ms;
}

@keyframes overlay-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes overlay-bloom {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  40% {
    opacity: 0.6;
    transform: scale(1);
  }
  100% {
    opacity: 0.4;
    transform: scale(1.05);
  }
}

@keyframes plant-grow {
  0% {
    opacity: 0;
    transform: scale(0.18) translateY(40px);
  }
  30% {
    opacity: 0.4;
    transform: scale(0.45) translateY(20px);
  }
  60% {
    opacity: 0.85;
    transform: scale(0.85) translateY(0);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes label-fade {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
