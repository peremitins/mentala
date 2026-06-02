import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useRoadmapLayout } from '../app/composables/useRoadmapLayout';
import type {
  ProgramChapterDto,
  ProgramStepDto,
} from '../shared/dto/retention';

/**
 * Геометрия карты пути — pure-функция от (steps, containerWidth, chapters).
 * Тесты проверяют:
 *  - корректность пустого случая,
 *  - монотонный рост cy,
 *  - сцентрированное положение первого узла по sin-волне,
 *  - наличие chapter-labels для каждой главы,
 *  - симметричный gap вокруг banner'а.
 */

function makeStep(
  n: number,
  status: ProgramStepDto['status'] = 'locked',
  chapter = 1
): ProgramStepDto {
  return {
    id: n,
    step: n,
    chapter,
    title: `Шаг ${n}`,
    subtitle: null,
    nextHint: null,
    durationMin: 5,
    energyReward: 1,
    actions: [],
    status,
    completedAt: null,
  };
}

describe('useRoadmapLayout', () => {
  it('возвращает пустой layout для пустого списка шагов', () => {
    const steps = ref<readonly ProgramStepDto[]>([]);
    const width = ref(360);
    const { nodes, totalHeight, chapterLabels } = useRoadmapLayout(
      steps,
      width
    );
    expect(nodes.value).toHaveLength(0);
    expect(chapterLabels.value).toHaveLength(0);
    expect(totalHeight.value).toBe(0);
  });

  it('cy монотонно растёт у соседних узлов (карта не идёт вверх)', () => {
    const steps = ref<readonly ProgramStepDto[]>([
      makeStep(1),
      makeStep(2),
      makeStep(3),
      makeStep(4),
      makeStep(5),
    ]);
    const width = ref(360);
    const { nodes } = useRoadmapLayout(steps, width);
    expect(nodes.value).toHaveLength(5);
    for (let i = 1; i < nodes.value.length; i++) {
      expect(nodes.value[i]!.cy).toBeGreaterThan(nodes.value[i - 1]!.cy);
    }
  });

  it('первый узел стоит примерно в центре по горизонтали (sin(0) = 0)', () => {
    const steps = ref<readonly ProgramStepDto[]>([makeStep(1)]);
    const width = ref(400);
    const { nodes } = useRoadmapLayout(steps, width);
    // sin(0) = 0 → ratio = 0.5 → cx = edgePadding + usable*0.5 = ~центр.
    expect(Math.abs(nodes.value[0]!.cx - 200)).toBeLessThan(2);
  });

  it('узлы не выходят за edge-padding при крайних точках sin-волны', () => {
    const steps = ref<readonly ProgramStepDto[]>(
      Array.from({ length: 16 }, (_, i) => makeStep(i + 1))
    );
    const width = ref(360);
    const { nodes, metrics } = useRoadmapLayout(steps, width);
    for (const node of nodes.value) {
      expect(node.cx).toBeGreaterThanOrEqual(metrics.value.edgePadding);
      expect(node.cx).toBeLessThanOrEqual(
        width.value - metrics.value.edgePadding
      );
    }
  });

  it('возвращает chapter-label для каждой главы', () => {
    const chapter1Steps = [makeStep(1, 'locked', 1), makeStep(2, 'locked', 1)];
    const chapter2Steps = [makeStep(3, 'locked', 2), makeStep(4, 'locked', 2)];
    const steps = ref<readonly ProgramStepDto[]>([
      ...chapter1Steps,
      ...chapter2Steps,
    ]);
    const chapters = ref<readonly ProgramChapterDto[] | undefined>([
      {
        chapter: 1,
        title: 'Знакомство',
        stepRange: '1-2',
        accent: 'teal',
        steps: chapter1Steps,
      },
      {
        chapter: 2,
        title: 'Инструменты',
        stepRange: '3-4',
        accent: 'violet',
        steps: chapter2Steps,
      },
    ]);
    const width = ref(400);
    const { chapterLabels } = useRoadmapLayout(steps, width, chapters);
    expect(chapterLabels.value).toHaveLength(2);
    expect(chapterLabels.value[0]!.chapter.title).toBe('Знакомство');
    expect(chapterLabels.value[1]!.chapter.title).toBe('Инструменты');
  });

  it('симметричный gap: расстояние node→banner равно banner→next-node', () => {
    const c1Steps = [makeStep(1, 'completed', 1)];
    const c2Steps = [makeStep(2, 'locked', 2)];
    const steps = ref<readonly ProgramStepDto[]>([...c1Steps, ...c2Steps]);
    const chapters = ref<readonly ProgramChapterDto[] | undefined>([
      {
        chapter: 1,
        title: 'A',
        stepRange: '1',
        accent: 'teal',
        steps: c1Steps,
      },
      {
        chapter: 2,
        title: 'B',
        stepRange: '2',
        accent: 'violet',
        steps: c2Steps,
      },
    ]);
    const width = ref(400);
    const { nodes, chapterLabels, metrics } = useRoadmapLayout(
      steps,
      width,
      chapters
    );

    const node1 = nodes.value[0]!;
    const banner2 = chapterLabels.value[1]!;
    const node2 = nodes.value[1]!;
    const halfBanner = metrics.value.chapterDividerHeight / 2;

    const upGap = banner2.cy - halfBanner - node1.cy;
    const downGap = node2.cy - banner2.cy - halfBanner;

    expect(Math.abs(upGap - downGap)).toBeLessThan(1);
  });

  it('адаптивные метрики: 320px узел меньше, чем на 768px', () => {
    const steps = ref<readonly ProgramStepDto[]>([makeStep(1)]);
    const smallWidth = ref(320);
    const small = useRoadmapLayout(steps, smallWidth);

    const tabletWidth = ref(768);
    const tablet = useRoadmapLayout(steps, tabletWidth);

    expect(tablet.metrics.value.nodeRadius).toBeGreaterThan(
      small.metrics.value.nodeRadius
    );
  });

  it('активный узел получает увеличенный radius (activeRadius > nodeRadius)', () => {
    const steps = ref<readonly ProgramStepDto[]>([
      makeStep(1, 'completed'),
      makeStep(2, 'active'),
      makeStep(3, 'locked'),
    ]);
    const width = ref(400);
    const { nodes, metrics } = useRoadmapLayout(steps, width);
    expect(nodes.value[0]!.radius).toBe(metrics.value.nodeRadius);
    expect(nodes.value[1]!.radius).toBe(metrics.value.activeRadius);
    expect(nodes.value[2]!.radius).toBe(metrics.value.nodeRadius);
    expect(metrics.value.activeRadius).toBeGreaterThan(
      metrics.value.nodeRadius
    );
  });
});
