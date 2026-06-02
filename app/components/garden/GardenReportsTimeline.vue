<template>
  <div class="reports-timeline">
    <ol class="reports-timeline__list" role="tablist">
      <li
        v-for="(point, index) in points"
        :key="point.step"
        role="presentation"
        class="reports-timeline__item"
        :class="{
          'reports-timeline__item--selected': selectedStep === point.step,
          'reports-timeline__item--ready': point.status === 'ready',
          'reports-timeline__item--pending': point.status === 'pending',
          'reports-timeline__item--last': index === points.length - 1,
        }"
      >
        <button
          type="button"
          class="reports-timeline__row"
          :disabled="!point.isClickable"
          :aria-label="`${point.title} · ${pointStatusLabel(point.status)}`"
          :aria-pressed="selectedStep === point.step"
          role="tab"
          @click="point.isClickable && emit('select', point.step)"
        >
          <span class="reports-timeline__rail" aria-hidden="true">
            <span class="reports-timeline__dot">
              <span
                v-if="point.isFresh"
                class="reports-timeline__pulse"
                aria-hidden="true"
              />
              <IconCheck
                v-if="point.status === 'ready'"
                class="reports-timeline__dot-icon"
              />
            </span>
            <span
              v-if="index < points.length - 1"
              class="reports-timeline__line"
            />
          </span>

          <span class="reports-timeline__body">
            <span class="reports-timeline__stage-row">
              <span class="reports-timeline__stage-label">{{
                point.eyebrow
              }}</span>
              <!-- Статус-чип показываем только когда программа ещё не
                   завершена (нет финального ready-отчёта). Когда финал готов
                   — статусы лишний шум, путь пройден целиком. -->
              <template v-if="!hasFinalReady">
                <span
                  v-if="point.status === 'ready'"
                  class="reports-timeline__status reports-timeline__status--ready"
                >
                  готов
                </span>
                <span
                  v-else
                  class="reports-timeline__status reports-timeline__status--pending"
                >
                  ещё впереди
                </span>
              </template>
            </span>
            <span class="reports-timeline__title">{{ point.title }}</span>
            <span v-if="point.periodLabel" class="reports-timeline__meta">
              {{ point.periodLabel }}
            </span>
          </span>
        </button>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconCheck from '~icons/lucide/check';
import type { CheckpointItemDto } from '@/shared/dto/program-checkpoint';

/**
 * Вертикальный таймлайн контрольных точек программы. Каждый узел показывает
 * тему этапа, диапазон дат периода и статус (готов / ещё впереди).
 *
 * Источник тем — `CHECKPOINT_TITLES` ниже. Темы общие для retention-программ
 * (4 чекпоинта: 7/14/21/30), но универсальны и работают для любого
 * 30-шагового сада. Если в будущем появятся программы с другим количеством
 * шагов — можно расширить мапу.
 *
 * Период (даты) подтягивается из structuredData чекпоинта, если он уже
 * готов. Для pending показываем только тему.
 */

type CheckpointStatus = 'ready' | 'pending' | 'failed';

const props = defineProps<{
  items: CheckpointItemDto[];
  selectedStep: number | null;
  lastViewedStep?: number | null;
}>();

const emit = defineEmits<{
  (e: 'select', step: 7 | 14 | 21 | 30): void;
}>();

type StageMeta = {
  step: 7 | 14 | 21 | 30;
  eyebrow: string;
  title: string;
};

const CHECKPOINT_STAGES: StageMeta[] = [
  {
    step: 7,
    eyebrow: 'Этап 1',
    title: 'Знакомство и первые инструменты',
  },
  {
    step: 14,
    eyebrow: 'Этап 2',
    title: 'Работа с мыслями и применение',
  },
  {
    step: 21,
    eyebrow: 'Этап 3',
    title: 'Углубление и закрепление',
  },
  {
    step: 30,
    eyebrow: 'Финал',
    title: 'Подведение итогов',
  },
];

function formatPeriod(startIso: string, endIso: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
    return `${fmt.format(new Date(startIso))} — ${fmt.format(new Date(endIso))}`;
  } catch {
    return '';
  }
}

// Если в timeline есть финальный готовый отчёт, значит программа пройдена
// до конца. По смыслу это означает, что все более ранние этапы пользователь
// тоже прошёл — даже если для них не сгенерирован отдельный checkpoint-отчёт
// (промежуточные могут быть пропущены технически). Помечаем их как ready,
// чтобы статус был согласованным «всё пройдено», а не «3 ещё впереди, финал готов».
const hasFinalReady = computed(() =>
  props.items.some(
    (i) => i.checkpointStep === 30 && i.kind === 'final' && i.status === 'ready'
  )
);

const points = computed(() =>
  CHECKPOINT_STAGES.map((stage) => {
    const item = props.items.find((i) => i.checkpointStep === stage.step);
    let status: CheckpointStatus = item?.status ?? 'pending';
    // Финал готов → все более ранние этапы тоже считаем пройденными.
    if (hasFinalReady.value && status === 'pending') {
      status = 'ready';
    }
    const isFresh =
      status === 'ready' &&
      props.lastViewedStep != null &&
      stage.step > props.lastViewedStep;
    const periodLabel =
      item?.structuredData?.periodStart && item.structuredData.periodEnd
        ? formatPeriod(
            item.structuredData.periodStart,
            item.structuredData.periodEnd
          )
        : null;
    return {
      step: stage.step,
      eyebrow: stage.eyebrow,
      title: stage.title,
      periodLabel,
      status,
      isFresh,
      // Кликабелен только тот узел, у которого реально есть отчёт в БД —
      // независимо от того, считаем ли мы этап пройденным по факту.
      isClickable: item != null && item.status === 'ready',
    };
  })
);

function pointStatusLabel(status: CheckpointStatus): string {
  if (status === 'ready') return 'отчёт готов';
  if (status === 'failed') return 'есть отчёт';
  return 'отчёт появится позже';
}
</script>

<style scoped>
.reports-timeline {
  padding: 4px 4px 0;
}

.reports-timeline__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.reports-timeline__item {
  position: relative;
}

.reports-timeline__row {
  display: grid;
  grid-template-columns: 36px 1fr;
  align-items: stretch;
  width: 100%;
  padding: 10px 12px 12px 0;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: transform 220ms ease;
  position: relative;
}

.reports-timeline__row:active:not(:disabled) {
  transform: scale(0.995);
}

.reports-timeline__row:disabled {
  cursor: default;
}

/* === Rail (левая колонка): точка + соединительная линия === */
.reports-timeline__rail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 6px;
}

.reports-timeline__dot {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.07);
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  transition: all 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.reports-timeline__item--ready .reports-timeline__dot {
  background: #a7f3d0;
  border-color: #a7f3d0;
  box-shadow:
    0 0 0 4px rgba(167, 243, 208, 0.14),
    0 4px 12px rgba(167, 243, 208, 0.22);
}

.reports-timeline__item--selected .reports-timeline__dot {
  width: 22px;
  height: 22px;
  box-shadow:
    0 0 0 6px rgba(167, 243, 208, 0.22),
    0 6px 18px rgba(167, 243, 208, 0.32);
}

.reports-timeline__dot-icon {
  width: 11px;
  height: 11px;
  color: #0a1322;
  stroke-width: 3.5;
}

.reports-timeline__item--pending .reports-timeline__dot-icon {
  display: none;
}

.reports-timeline__pulse {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: rgba(167, 243, 208, 0.42);
  animation: reports-timeline-pulse 1.8s ease-out infinite;
  pointer-events: none;
}

@keyframes reports-timeline-pulse {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

.reports-timeline__line {
  position: absolute;
  top: 24px;
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: 1.5px;
  background: linear-gradient(
    180deg,
    rgba(167, 243, 208, 0.32) 0%,
    rgba(255, 255, 255, 0.08) 100%
  );
}

.reports-timeline__item--last .reports-timeline__line {
  display: none;
}

/* === Body (правая колонка): текст с темой и метаданными === */
.reports-timeline__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px 10px 12px;
  border-radius: 14px;
  transition:
    background 220ms ease,
    border 220ms ease,
    box-shadow 220ms ease;
  border: 1px solid transparent;
}

.reports-timeline__item--selected .reports-timeline__body {
  background: rgba(167, 243, 208, 0.05);
  border-color: rgba(167, 243, 208, 0.18);
  box-shadow: 0 4px 18px rgba(167, 243, 208, 0.06);
}

.reports-timeline__row:hover:not(:disabled) .reports-timeline__body {
  background: rgba(255, 255, 255, 0.025);
}

.reports-timeline__stage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.reports-timeline__stage-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: hsl(var(--foreground) / 0.5);
}

.reports-timeline__item--ready .reports-timeline__stage-label {
  color: rgba(167, 243, 208, 0.85);
}

.reports-timeline__item--selected .reports-timeline__stage-label {
  color: rgb(167, 243, 208);
}

.reports-timeline__status {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
}

.reports-timeline__status--ready {
  color: rgb(167, 243, 208);
  background: rgba(167, 243, 208, 0.1);
  border-color: rgba(167, 243, 208, 0.25);
}

.reports-timeline__status--pending {
  color: hsl(var(--foreground) / 0.45);
  background: rgba(255, 255, 255, 0.035);
  border-color: rgba(255, 255, 255, 0.08);
}

.reports-timeline__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: hsl(var(--foreground) / 0.7);
  transition: color 220ms ease;
}

.reports-timeline__item--ready .reports-timeline__title {
  color: hsl(var(--foreground) / 0.92);
}

.reports-timeline__item--selected .reports-timeline__title {
  color: hsl(var(--foreground));
}

.reports-timeline__meta {
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.35;
  color: hsl(var(--foreground) / 0.5);
  font-feature-settings: 'tnum' 1;
}
</style>
