import { computed, type ComputedRef, type Ref } from 'vue';
import type {
  ProgramChapterDto,
  ProgramStepDto,
  ProgramStepStatus,
} from '@/shared/dto/retention';

/**
 * Геометрия карты пути.
 *
 * Карта — последовательность кружков-узлов без соединительных линий.
 * Главы отделяются горизонтальным дивайдером на всю ширину, для которого
 * в `layout` вычисляется отдельная Y-координата + увеличенный rowGap
 * (микропауза) вокруг дивайдера.
 *
 * Composable также возвращает `segments`/`pathD` (Catmull-Rom через все
 * узлы) — рендерер сейчас их не использует, но они нужны для будущей
 * GSAP reveal-анимации тропы (Этап 5). Удалять не надо.
 *
 * Не держит DOM-ссылок, без side-эффектов. Чистые реактивные вычисления.
 */

export type RoadmapNode = {
  step: ProgramStepDto;
  index: number;
  cx: number;
  cy: number;
  radius: number;
  status: ProgramStepStatus;
  chapter: number;
};

export type RoadmapChapterLabel = {
  chapter: ProgramChapterDto;
  /** Центр Y разделителя на всю ширину. */
  cy: number;
};

export type RoadmapLayoutMetrics = {
  nodeRadius: number;
  activeRadius: number;
  rowGap: number;
  edgePadding: number;
  /** Высота строки дивайдера главы (с воздухом). */
  chapterDividerHeight: number;
};

type UseRoadmapLayoutOptions = {
  metrics?: Ref<Partial<RoadmapLayoutMetrics>>;
};

/**
 * Sin-волна с амплитудой 0.34. Узлы плавно «перетекают» через центр,
 * касаясь краёв (16% / 84%). Период 8 шагов — за 30 шагов это даёт
 * ~3.75 волны: «петляющая» карта, а не лестница.
 */
function patternRatio(index: number): number {
  const period = 8;
  const amplitude = 0.34;
  return 0.5 + amplitude * Math.sin((index / period) * 2 * Math.PI);
}

function deriveMetrics(width: number): RoadmapLayoutMetrics {
  if (width < 340) {
    return {
      nodeRadius: 30,
      activeRadius: 34,
      rowGap: 100,
      edgePadding: 30,
      chapterDividerHeight: 44,
    };
  }
  if (width < 400) {
    return {
      nodeRadius: 32,
      activeRadius: 36,
      rowGap: 108,
      edgePadding: 32,
      chapterDividerHeight: 48,
    };
  }
  if (width < 480) {
    return {
      nodeRadius: 34,
      activeRadius: 38,
      rowGap: 116,
      edgePadding: 36,
      chapterDividerHeight: 52,
    };
  }
  if (width < 768) {
    return {
      nodeRadius: 36,
      activeRadius: 40,
      rowGap: 124,
      edgePadding: 40,
      chapterDividerHeight: 56,
    };
  }
  return {
    nodeRadius: 38,
    activeRadius: 42,
    rowGap: 132,
    edgePadding: 48,
    chapterDividerHeight: 60,
  };
}

export function useRoadmapLayout(
  steps:
    | Ref<readonly ProgramStepDto[]>
    | ComputedRef<readonly ProgramStepDto[]>,
  containerWidth: Ref<number> | ComputedRef<number>,
  chapters?:
    | Ref<readonly ProgramChapterDto[] | undefined>
    | ComputedRef<readonly ProgramChapterDto[] | undefined>,
  options: UseRoadmapLayoutOptions = {}
) {
  const metrics = computed<RoadmapLayoutMetrics>(() => {
    const base = deriveMetrics(containerWidth.value || 360);
    if (!options.metrics) return base;
    return { ...base, ...options.metrics.value };
  });

  const chapterIndex = computed(() => {
    const list = chapters?.value ?? [];
    const byStep = new Map<number, ProgramChapterDto>();
    const firstStepNumbers = new Set<number>();
    for (const chapter of list) {
      if (chapter.steps.length === 0) continue;
      firstStepNumbers.add(chapter.steps[0]!.step);
      for (const step of chapter.steps) {
        byStep.set(step.step, chapter);
      }
    }
    return { byStep, firstStepNumbers };
  });

  /**
   * Расчёт layout идёт последовательно по шагам с курсором cy:
   *  - На границе главы вставляется микропауза + дивайдер.
   *  - Обычный шаг ставится на rowGap от предыдущего.
   * Дивайдер первой главы тоже отрисовывается сверху (даёт контекст
   * «вот это начало главы Знакомство»).
   */
  const layout = computed<{
    nodes: RoadmapNode[];
    chapterLabels: RoadmapChapterLabel[];
    totalHeight: number;
  }>(() => {
    const items = steps.value;
    if (!items || items.length === 0) {
      return { nodes: [], chapterLabels: [], totalHeight: 0 };
    }
    const m = metrics.value;
    const width = Math.max(containerWidth.value || 0, m.edgePadding * 2 + 80);
    const usable = width - m.edgePadding * 2;
    const { byStep, firstStepNumbers } = chapterIndex.value;
    const hasChapters = firstStepNumbers.size > 0;

    const nodes: RoadmapNode[] = [];
    const chapterLabels: RoadmapChapterLabel[] = [];

    // Начальный воздух сверху ProgramRoadmapPath. Если первый шаг —
    // chapter start (что обычно), banner ставится впритык к верху.
    // Если глав нет — обычный rowGap*0.5 чтобы первый узел не упёрся в край.
    const firstItem = items[0]!;
    const firstIsChapterStart =
      hasChapters && firstStepNumbers.has(firstItem.step);
    let cy = firstIsChapterStart ? 0 : m.rowGap * 0.5;

    items.forEach((step, index) => {
      const chapter = byStep.get(step.step);
      const isChapterStart = hasChapters && firstStepNumbers.has(step.step);

      if (isChapterStart && chapter) {
        // Симметричный воздух вокруг разделителя. Не меньше чем радиус
        // активного узла + 10px воздуха — иначе соседние узлы (в т.ч. active,
        // он крупнее) визуально налезали бы на banner. Сверху ограничиваем
        // `rowGap*0.45`, чтобы паузы не становились слишком разрежёнными.
        const minGapToNode = m.activeRadius + 10;
        const symmetricGap = Math.min(
          m.rowGap * 0.45,
          Math.max(m.rowGap * 0.18, minGapToNode)
        );
        if (index > 0) cy += symmetricGap;
        const dividerCy = cy + m.chapterDividerHeight / 2;
        chapterLabels.push({ chapter, cy: dividerCy });
        cy = dividerCy + m.chapterDividerHeight / 2 + symmetricGap;
      } else if (index > 0) {
        cy += m.rowGap;
      }

      const ratio = patternRatio(index);
      const cx = m.edgePadding + ratio * usable;
      const radius = step.status === 'active' ? m.activeRadius : m.nodeRadius;

      nodes.push({
        step,
        index,
        cx,
        cy,
        radius,
        status: step.status,
        chapter: chapter?.chapter ?? 0,
      });
    });

    const last = nodes[nodes.length - 1]!;
    const totalHeight = last.cy + m.rowGap * 0.5;
    return { nodes, chapterLabels, totalHeight };
  });

  const nodes = computed(() => layout.value.nodes);
  const chapterLabels = computed(() => layout.value.chapterLabels);
  const totalHeight = computed(() => layout.value.totalHeight);

  /**
   * Catmull-Rom сегменты между соседними узлами. Сейчас не используются
   * рендером (карта без соединительных линий), но останутся для Этапа 5 —
   * там может пригодиться GSAP reveal-анимация «зажигающегося пути».
   */
  const segments = computed<RoadmapPathSegment[]>(() => {
    const list = nodes.value;
    if (list.length < 2) return [];
    const out: RoadmapPathSegment[] = [];
    for (let i = 0; i < list.length - 1; i++) {
      const p0 = list[i - 1] ?? list[i]!;
      const p1 = list[i]!;
      const p2 = list[i + 1]!;
      const p3 = list[i + 2] ?? list[i + 1]!;
      out.push({
        fromIndex: p1.index,
        toIndex: p2.index,
        d: catmullRomToBezier(p0, p1, p2, p3),
        kind: classifySegment(p1.status, p2.status),
      });
    }
    return out;
  });

  const pathD = computed<string>(() => {
    const list = nodes.value;
    if (list.length === 0) return '';
    if (list.length === 1) {
      return `M ${list[0]!.cx.toFixed(2)} ${list[0]!.cy.toFixed(2)}`;
    }
    let d = `M ${list[0]!.cx.toFixed(2)} ${list[0]!.cy.toFixed(2)}`;
    for (let i = 0; i < list.length - 1; i++) {
      const p0 = list[i - 1] ?? list[i]!;
      const p1 = list[i]!;
      const p2 = list[i + 1]!;
      const p3 = list[i + 2] ?? list[i + 1]!;
      const segment = catmullRomToBezier(p0, p1, p2, p3);
      d += ' ' + segment.slice(segment.indexOf('C'));
    }
    return d;
  });

  return {
    nodes,
    chapterLabels,
    segments,
    pathD,
    totalHeight,
    metrics,
  };
}

function catmullRomToBezier(
  p0: { cx: number; cy: number },
  p1: { cx: number; cy: number },
  p2: { cx: number; cy: number },
  p3: { cx: number; cy: number }
): string {
  const cp1x = p1.cx + (p2.cx - p0.cx) / 6;
  const cp1y = p1.cy + (p2.cy - p0.cy) / 6;
  const cp2x = p2.cx - (p3.cx - p1.cx) / 6;
  const cp2y = p2.cy - (p3.cy - p1.cy) / 6;
  return (
    `M ${p1.cx.toFixed(2)} ${p1.cy.toFixed(2)}` +
    ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)},` +
    ` ${cp2x.toFixed(2)} ${cp2y.toFixed(2)},` +
    ` ${p2.cx.toFixed(2)} ${p2.cy.toFixed(2)}`
  );
}

export type RoadmapPathSegmentKind = 'completed' | 'reaching' | 'pending';

export type RoadmapPathSegment = {
  fromIndex: number;
  toIndex: number;
  d: string;
  kind: RoadmapPathSegmentKind;
};

function classifySegment(
  prev: ProgramStepStatus,
  cur: ProgramStepStatus
): RoadmapPathSegmentKind {
  if (prev === 'completed' && cur === 'completed') return 'completed';
  if (prev === 'completed' && cur === 'active') return 'reaching';
  return 'pending';
}
