<template>
  <Transition name="rt-ambient-fade">
    <div
      v-if="isVisible"
      class="rt-ambient-frame"
      :class="{ 'is-active': isActive, 'is-transition': !isActive }"
      aria-hidden="true"
    >
      <div class="rt-ambient-frame__glow"></div>
    </div>
  </Transition>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRealtimeVoiceUiStore } from '@/app/stores/realtimeVoiceUi';

const realtimeVoiceUi = useRealtimeVoiceUiStore();
const { status } = storeToRefs(realtimeVoiceUi);

// Активная рамка: только в фазе active. На starting/stopping — лёгкая
// разогревочная фаза с приглушённой яркостью, чтобы появление было плавным.
const isActive = computed(() => status.value === 'active');
const isVisible = computed(
  () => status.value === 'active' || status.value === 'starting'
);
</script>

<style scoped>
/* ───── Настройки рамки (крутим тут) ─────
 * Цвета:
 *   --rt-color-mid         — средний слой свечения
 *   --rt-color-deep        — глубокий халоу, уходящий внутрь
 * Базовые (выдох) и пиковые (вдох) значения отделены, чтобы амплитуду
 * дыхания было удобно регулировать без правки keyframes:
 *   --rt-edge-w-out / --rt-edge-w-in       — толщина контурной линии
 *   --rt-blur-mid-out / --rt-blur-mid-in   — радиус среднего свечения
 *   --rt-blur-deep-out / --rt-blur-deep-in — радиус глубокого халоу
 *   --rt-alpha-*-out / --rt-alpha-*-in     — насыщенность каждого слоя
 *   --rt-opacity-out / --rt-opacity-in     — общая прозрачность фаз
 *   --rt-breath-duration                   — длительность одного цикла
 */
.rt-ambient-frame {
  position: fixed;
  inset: 0;
  z-index: 40;
  pointer-events: none;

  /* Палитра */
  --rt-color-mid: 3, 251, 255;
  --rt-color-deep: 12, 196, 250;

  /* Геометрия — выдох (узко, спокойно) */
  --rt-edge-w-out: 1.5px;
  --rt-blur-mid-out: 14px;
  --rt-blur-deep-out: 42px;

  /* Геометрия — вдох (чуть шире, без перекрытия интерфейса) */
  --rt-edge-w-in: 0px;
  --rt-blur-mid-in: 22px;
  --rt-blur-deep-in: 64px;

  /* Насыщенность — выдох */
  --rt-alpha-edge-out: 0.7;
  --rt-alpha-mid-out: 0.5;
  --rt-alpha-deep-out: 0.26;

  /* Насыщенность — вдох */
  --rt-alpha-edge-in: 0.7;
  --rt-alpha-mid-in: 0.5;
  --rt-alpha-deep-in: 0.26;

  /* Прозрачность фаз и темп */
  --rt-opacity-out: 0.7;
  --rt-opacity-in: 1;
  --rt-breath-duration: 5s;
}

.rt-ambient-frame__glow {
  position: absolute;
  inset: 0;
  /* Учитываем safe-area, чтобы свечение не уходило под нотч/жесты. */
  margin: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);

  /* Стартовое состояние = «выдох». Анимация переключает на «вдох» и обратно. */
  box-shadow:
    inset 0 0 var(--rt-blur-mid-out)
      rgba(var(--rt-color-mid), var(--rt-alpha-mid-out)),
    inset 0 0 var(--rt-blur-deep-out)
      rgba(var(--rt-color-deep), var(--rt-alpha-deep-out));

  opacity: 0;
  will-change: opacity, box-shadow;
}

.rt-ambient-frame.is-active .rt-ambient-frame__glow {
  animation: rt-ambient-breathe var(--rt-breath-duration) ease-in-out infinite;
}

.rt-ambient-frame.is-transition .rt-ambient-frame__glow {
  /* На starting/stopping — статичный приглушённый свет без пульсации. */
  opacity: 0.5;
}

@keyframes rt-ambient-breathe {
  0%,
  100% {
    opacity: var(--rt-opacity-out);
    box-shadow:
      inset 0 0 var(--rt-blur-mid-out)
        rgba(var(--rt-color-mid), var(--rt-alpha-mid-out)),
      inset 0 0 var(--rt-blur-deep-out)
        rgba(var(--rt-color-deep), var(--rt-alpha-deep-out));
  }
  50% {
    opacity: var(--rt-opacity-in);
    box-shadow:
      inset 0 0 var(--rt-blur-mid-in)
        rgba(var(--rt-color-mid), var(--rt-alpha-mid-in)),
      inset 0 0 var(--rt-blur-deep-in)
        rgba(var(--rt-color-deep), var(--rt-alpha-deep-in));
  }
}

/* Доступность: уважаем системную настройку «уменьшить движение». */
@media (prefers-reduced-motion: reduce) {
  .rt-ambient-frame.is-active .rt-ambient-frame__glow {
    animation: none;
    opacity: 0.8;
  }
}

/* Плавное появление/исчезновение всей рамки. */
.rt-ambient-fade-enter-active,
.rt-ambient-fade-leave-active {
  transition: opacity 420ms ease;
}
.rt-ambient-fade-enter-from,
.rt-ambient-fade-leave-to {
  opacity: 0;
}
</style>
