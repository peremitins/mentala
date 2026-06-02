<template>
  <button
    type="button"
    class="roadmap-cta"
    :aria-label="`Перейти к шагу ${step.step}: ${step.title}`"
    @click="onTap"
  >
    <span class="roadmap-cta__inner">
      <span class="roadmap-cta__text">
        <span class="roadmap-cta__label">Сейчас здесь</span>
        <span class="roadmap-cta__title">
          Шаг {{ step.step }} · {{ step.title }}
        </span>
      </span>
      <span class="roadmap-cta__action">
        Продолжить
        <IconArrowRight class="roadmap-cta__action-icon" aria-hidden="true" />
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import IconArrowRight from '~icons/lucide/arrow-right';
import { useRoadmapHaptics } from '@/app/composables/useRoadmapHaptics';
import type { ProgramStepDto } from '@/shared/dto/retention';

defineProps<{
  step: ProgramStepDto;
}>();

const emit = defineEmits<{
  continue: [];
}>();

const haptics = useRoadmapHaptics();

function onTap() {
  void haptics.trigger('tap-active');
  emit('continue');
}
</script>

<style scoped>
/* Sticky bottom-bar над BottomNav. Появляется когда активный узел вышел
   из viewport — даёт пользователю одно-тап-возврат к текущему шагу.
   Позиционирован fixed относительно viewport: над BottomNav через
   safe-area + примерная высота BottomNav (76px). */
.roadmap-cta {
  position: fixed;
  left: 0;
  right: 0;
  /* Native env() для iOS notch + Android nav. Дополнительно 76px — это
     примерная высота BottomNav (с padding'ом и контентом). */
  bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  display: block;
  width: 100%;
  padding: 0 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.roadmap-cta__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 auto;
  padding: 12px 14px 12px 18px;
  max-width: 768px;
  border-radius: 999px;
  border: 1px solid hsl(var(--roadmap-node-active-border) / 0.5);
  background: linear-gradient(
    180deg,
    hsl(45 96% 60% / 0.95),
    hsl(45 96% 55% / 0.95)
  );
  color: hsl(var(--background));
  box-shadow:
    0 8px 24px -8px hsl(45 96% 50% / 0.55),
    0 4px 12px hsl(0 0% 0% / 0.18);
  /* Transition внутреннего active-feedback. Сам показ/скрытие управляется
     родительским <Transition>. */
  transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.roadmap-cta:active .roadmap-cta__inner {
  transform: scale(0.98);
}

.roadmap-cta:focus-visible .roadmap-cta__inner {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 3px;
}

.roadmap-cta__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  flex: 1;
  line-height: 1.2;
}

.roadmap-cta__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
}

.roadmap-cta__title {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.roadmap-cta__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 6px 10px 6px 12px;
  border-radius: 999px;
  background: hsl(var(--background) / 0.18);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.roadmap-cta__action-icon {
  width: 14px;
  height: 14px;
  stroke-width: 2.5;
}

@media (prefers-reduced-motion: reduce) {
  .roadmap-cta__inner {
    transition: none;
  }
  /* Vue <Transition>-классы тоже сбрасываем — иначе при появлении/уходе
     CTA будет slide+fade даже у пользователя с reduce-motion. */
  .roadmap-cta {
    transition: none !important;
  }
}
</style>
