<template>
  <Teleport to="body">
    <Transition name="pending-report-backdrop">
      <div
        v-if="pending"
        class="pending-report-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-report-title"
        @click.self="onDismiss"
      />
    </Transition>

    <Transition name="pending-report-modal">
      <section v-if="pending" class="pending-report-modal">
        <div class="pending-report-modal__icon" aria-hidden="true">
          <IconSparkles class="h-5 w-5 text-emerald-200" />
        </div>
        <p id="pending-report-title" class="pending-report-modal__eyebrow">
          {{ eyebrowLabel }}
        </p>
        <h2 class="pending-report-modal__title">
          {{ titleText }}
        </h2>
        <p class="pending-report-modal__subtitle">
          {{ subtitleText }}
        </p>
        <div class="pending-report-modal__actions">
          <button
            type="button"
            class="pending-report-modal__cta-primary"
            @click="onOpen"
          >
            Открыть отчёт
          </button>
          <button
            type="button"
            class="pending-report-modal__cta-secondary"
            @click="onDismiss"
          >
            Позже
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconSparkles from '~icons/lucide/sparkles';
import type { PendingReport } from '@/app/composables/usePendingReportNotification';

/**
 * Маленькая центрированная модалка про готовый отчёт. Показывается, когда
 * приложение активно (foreground) и есть непросмотренный отчёт по контрольной
 * точке или финалу программы. См. usePendingReportNotification.
 *
 * Два CTA:
 *   - «Открыть отчёт» — навигация в /garden с query openReport, чтобы
 *     родительская страница автоматически открыла соответствующий sheet.
 *     Mark-viewed сработает при открытии sheet'а (через timeline-endpoint).
 *   - «Позже» — локальное скрытие до следующего успешного poll'а (через
 *     5 минут или после visibility change).
 *
 * Если приложение в background — модалка не показывается. Вместо неё
 * прилетит push (см. серверный delivery.service.ts).
 */

const props = defineProps<{
  pending: PendingReport | null;
}>();

const emit = defineEmits<{
  (e: 'dismiss'): void;
  (e: 'open', report: PendingReport): void;
}>();

const eyebrowLabel = computed(() => {
  if (!props.pending) return '';
  if (props.pending.kind === 'final') return 'Готов финальный разбор';
  return 'Готова промежуточная сводка';
});

const titleText = computed(() => {
  if (!props.pending) return '';
  if (props.pending.kind === 'final') {
    return `Сад «${props.pending.programTitle}» завершён`;
  }
  const stage = Math.ceil(props.pending.checkpointStep / 7);
  return `Этап ${stage} · ${props.pending.programTitle}`;
});

const subtitleText = computed(() => {
  if (!props.pending) return '';
  if (props.pending.kind === 'final') {
    return 'Я собрал всё, что произошло за программу, в один разбор. Загляни.';
  }
  return 'Я собрал короткий итог по пройденному отрезку. Загляни на минуту.';
});

function onOpen() {
  if (props.pending) emit('open', props.pending);
}

function onDismiss() {
  emit('dismiss');
}
</script>

<style scoped>
.pending-report-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 12, 20, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.pending-report-backdrop-enter-active,
.pending-report-backdrop-leave-active {
  transition: opacity 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
.pending-report-backdrop-enter-from,
.pending-report-backdrop-leave-to {
  opacity: 0;
}

.pending-report-modal {
  position: fixed;
  z-index: 10000;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(100% - 32px);
  max-width: 360px;
  padding: 22px 22px 18px;
  background: linear-gradient(
    180deg,
    rgba(20, 27, 41, 0.98) 0%,
    rgba(12, 17, 28, 0.99) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  color: hsl(var(--foreground));
  text-align: center;
}

.pending-report-modal-enter-active {
  transition:
    opacity 320ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.pending-report-modal-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.pending-report-modal-enter-from,
.pending-report-modal-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 12px));
}

.pending-report-modal__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 0 auto 12px;
  background: rgba(167, 243, 208, 0.14);
  border: 1px solid rgba(167, 243, 208, 0.25);
  border-radius: 999px;
}

.pending-report-modal__eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: hsl(var(--foreground) / 0.6);
}

.pending-report-modal__title {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: hsl(var(--foreground));
}

.pending-report-modal__subtitle {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--foreground) / 0.7);
}

.pending-report-modal__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
}

.pending-report-modal__cta-primary {
  width: 100%;
  padding: 11px 18px;
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--background));
  background: hsl(var(--foreground));
  border-radius: 999px;
  transition: all 200ms ease;
}
.pending-report-modal__cta-primary:hover {
  background: hsl(var(--foreground) / 0.9);
}
.pending-report-modal__cta-primary:active {
  transform: scale(0.99);
}

.pending-report-modal__cta-secondary {
  width: 100%;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground) / 0.65);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  transition: all 200ms ease;
}
.pending-report-modal__cta-secondary:hover {
  color: hsl(var(--foreground));
  background: rgba(255, 255, 255, 0.04);
}
</style>
