import type {
  AnxietyTimelinePointDto,
  MoodTimelinePointDto,
} from '@/shared/dto/program-checkpoint';

/**
 * Чистые функции построения series и options для MoodAnxietyChart.
 *
 * Вынесены из компонента для упрощения unit-тестирования: ApexCharts требует
 * чтобы `yaxis[i]` соответствовал реально присутствующей series — при
 * рассинхроне библиотека падает с `Cannot read properties of undefined
 * (reading 'logarithmic')`. Эти функции гарантируют, что массив yaxis
 * включает только конфиги для тех series, которые реально есть в данных.
 */

const ANXIETY_COLOR = '#a7f3d0'; // emerald-200
const MOOD_COLOR = '#fcd34d'; // amber-300

export type ChartSeries = {
  name: string;
  data: Array<[number, number]>;
};

export type BuildSeriesInput = {
  anxietyTimeline: AnxietyTimelinePointDto[];
  moodTimeline: MoodTimelinePointDto[];
};

/**
 * Сортирует точки по времени и удаляет дубликаты по timestamp (оставляет
 * последнее значение). ApexCharts требует отсортированные данные для area
 * chart, а дубликаты x-координат дают визуальные артефакты (зигзаги, ложные
 * «линии»). Например, если на одном шаге два rating_scale-вопроса — у них
 * одинаковый createdAt, и без дедупа график рисует их как отдельные изломы.
 */
function sortAndDedupe(
  points: Array<[number, number]>
): Array<[number, number]> {
  if (points.length <= 1) return points;
  const byTime = new Map<number, number>();
  for (const [t, v] of points) {
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    byTime.set(t, v);
  }
  return Array.from(byTime.entries()).sort((a, b) => a[0] - b[0]);
}

export function buildMoodAnxietyChartSeries(
  input: BuildSeriesInput
): ChartSeries[] {
  const items: ChartSeries[] = [];
  if (input.anxietyTimeline.length > 0) {
    items.push({
      name: 'Тревога',
      data: sortAndDedupe(
        input.anxietyTimeline.map(
          (p) => [new Date(p.createdAt).getTime(), p.value] as [number, number]
        )
      ),
    });
  }
  if (input.moodTimeline.length > 0) {
    items.push({
      name: 'Настроение',
      data: sortAndDedupe(
        input.moodTimeline.map(
          (p) => [new Date(p.date).getTime(), p.score] as [number, number]
        )
      ),
    });
  }
  return items;
}

export type BuildOptionsInput = {
  compact: boolean;
  hasAnxiety: boolean;
  hasMood: boolean;
  anxietyMin: number;
  anxietyMax: number;
  /**
   * BCP-47 локаль для форматирования дат (ru-RU / en-US). По умолчанию ru-RU,
   * чтобы график не показывал английские месяцы пользователю с русским UI.
   */
  locale?: string;
};

export type ChartYAxis = {
  seriesName: string;
  show: boolean;
  min?: number;
  max?: number;
  opposite?: boolean;
  tickAmount?: number;
  labels?: {
    style: { colors: string; fontSize: string };
    formatter: (v: number) => string;
  };
  title?: {
    text: string;
    style: { color: string; fontSize: string; fontWeight: number };
  };
};

export type ChartOptions = {
  chart: Record<string, unknown>;
  colors: string[];
  dataLabels: { enabled: boolean };
  stroke: { curve: 'smooth'; width: number };
  fill: Record<string, unknown>;
  grid: Record<string, unknown>;
  legend: Record<string, unknown>;
  markers: Record<string, unknown>;
  xaxis: Record<string, unknown>;
  yaxis: ChartYAxis[];
  tooltip: Record<string, unknown>;
};

const MOOD_LABELS: Record<number, string> = {
  [-2]: 'оч.плохо',
  [-1]: 'грустно',
  [0]: 'норм',
  [1]: 'хорошо',
  [2]: 'отлично',
};

export function buildMoodAnxietyChartOptions(
  input: BuildOptionsInput
): ChartOptions {
  const locale = input.locale || 'ru-RU';

  // Кэшируем форматтеры — Intl.DateTimeFormat дорогой при частых вызовах
  // (apex дёргает formatter для каждой метки на каждой перерисовке).
  const dayFmt = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  });
  const dayHourFmt = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const colors: string[] = [];
  const yaxis: ChartYAxis[] = [];

  if (input.hasAnxiety) {
    colors.push(ANXIETY_COLOR);
    yaxis.push({
      seriesName: 'Тревога',
      show: !input.compact,
      min: input.anxietyMin,
      max: input.anxietyMax,
      tickAmount: 4,
      labels: {
        style: { colors: 'rgba(255,255,255,0.5)', fontSize: '11px' },
        formatter: (v: number) => `${Math.round(v)}`,
      },
      title: {
        text: 'Тревога',
        style: { color: ANXIETY_COLOR, fontSize: '11px', fontWeight: 500 },
      },
    });
  }

  if (input.hasMood) {
    colors.push(MOOD_COLOR);
    yaxis.push({
      seriesName: 'Настроение',
      show: !input.compact,
      opposite: input.hasAnxiety,
      min: -2,
      max: 2,
      tickAmount: 4,
      labels: {
        style: { colors: 'rgba(255,255,255,0.5)', fontSize: '11px' },
        formatter: (v: number) => MOOD_LABELS[Math.round(v)] ?? '',
      },
      title: {
        text: 'Настроение',
        style: { color: MOOD_COLOR, fontSize: '11px', fontWeight: 500 },
      },
    });
  }

  return {
    chart: {
      type: 'area',
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: !input.compact,
        easing: 'easeinout',
        speed: 600,
      },
      foreColor: 'rgba(255,255,255,0.55)',
      fontFamily: 'inherit',
    },
    colors,
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth',
      width: input.compact ? 2 : 3,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.02,
        stops: [0, 95, 100],
      },
    },
    grid: {
      show: !input.compact,
      borderColor: 'rgba(255,255,255,0.06)',
      strokeDashArray: 4,
      padding: { left: 0, right: 8, top: 0, bottom: 0 },
    },
    legend: {
      show: !input.compact,
      position: 'top',
      horizontalAlign: 'left',
      labels: { colors: 'rgba(255,255,255,0.75)' },
      markers: { width: 8, height: 8, radius: 4 },
      itemMargin: { horizontal: 12, vertical: 4 },
    },
    // Markers — видимые точки на каждом значении. Это критично для
    // финального отчёта, где данных мало (3-5 точек): без markers
    // график выглядит как абстрактные линии, по которым непонятно
    // что и когда измерялось.
    markers: {
      size: input.compact ? 0 : 5,
      strokeWidth: 2,
      strokeColors: 'rgba(10, 14, 22, 0.95)',
      hover: { sizeOffset: 2 },
    },
    xaxis: {
      type: 'datetime',
      labels: {
        show: !input.compact,
        style: { colors: 'rgba(255,255,255,0.55)', fontSize: '11px' },
        // Кастомный formatter через Intl.DateTimeFormat — ApexCharts по
        // умолчанию форматирует даты на английском, что показывалось
        // у пользователя с русским UI как «22 May 15:00». Здесь
        // подставляем локаль из настроек юзера.
        formatter: (val: string | number) => {
          const n = typeof val === 'number' ? val : Number(val);
          if (!Number.isFinite(n)) return '';
          return dayFmt.format(new Date(n));
        },
        datetimeUTC: false,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis,
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      x: {
        formatter: (val: number) => dayHourFmt.format(new Date(val)),
      },
      // Кастомизируем значение для mood: вместо «-2» / «2» показываем
      // словесную метку — это понятнее, чем абстрактные числа на шкале.
      y: {
        formatter: (val: number, opts: { seriesIndex: number }) => {
          const seriesName =
            opts.seriesIndex === 0 && input.hasAnxiety
              ? 'Тревога'
              : 'Настроение';
          if (seriesName === 'Настроение') {
            return MOOD_LABELS[Math.round(val)] ?? String(val);
          }
          return `${Math.round(val)}/${input.anxietyMax}`;
        },
      },
    },
  };
}
