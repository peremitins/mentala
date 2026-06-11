import type {
  AssessmentDefinition,
  AssessmentScoreDirection,
} from '@/shared/dto/assessments';

type AssessmentResultTone = 'good' | 'middle' | 'watch' | 'hard' | 'neutral';
type AssessmentCategory = AssessmentDefinition['category'];

type AssessmentResultScaleSegment = {
  id: string;
  className: string;
};

export type AssessmentResultBadge = {
  label: string;
  ariaLabel: string;
  tone: AssessmentResultTone;
  className: string;
  textClassName: string;
  scaleSegments: AssessmentResultScaleSegment[];
};

const toneClassMap: Record<AssessmentResultTone, string> = {
  good: 'border-emerald-200/30 bg-emerald-200/[0.16] text-emerald-50',
  middle: 'border-sky-200/30 bg-sky-200/[0.14] text-sky-50',
  watch: 'border-amber-200/30 bg-amber-200/[0.16] text-amber-50',
  hard: 'border-rose-200/30 bg-rose-200/[0.16] text-rose-50',
  neutral: 'border-white/12 bg-white/[0.08] text-foreground/60',
};

const textClassMap: Record<AssessmentResultTone, string> = {
  good: 'text-emerald-100',
  middle: 'text-sky-100',
  watch: 'text-amber-100',
  hard: 'text-rose-100',
  neutral: 'text-foreground/60',
};

export function getAssessmentResultBadge(params: {
  bandId: string;
  scoreDirection: AssessmentScoreDirection;
  category?: AssessmentCategory;
}): AssessmentResultBadge {
  const tone = getAssessmentResultTone(params);
  const label = getAssessmentResultLabel(params);

  return {
    label,
    ariaLabel: `Оценка результата: ${label.toLowerCase()}`,
    tone,
    className: toneClassMap[tone],
    textClassName: textClassMap[tone],
    scaleSegments: getAssessmentScaleSegments(params),
  };
}

function getAssessmentResultTone(params: {
  bandId: string;
  scoreDirection: AssessmentScoreDirection;
}): AssessmentResultTone {
  if (params.scoreDirection === 'higher_is_worse') {
    if (params.bandId === 'low') return 'good';
    if (params.bandId === 'mild') return 'middle';
    if (params.bandId === 'moderate') return 'watch';
    if (params.bandId === 'high') return 'hard';
  }

  if (params.scoreDirection === 'higher_is_better') {
    if (params.bandId === 'low') return 'hard';
    if (params.bandId === 'moderate') return 'watch';
    if (params.bandId === 'high') return 'good';
  }

  return 'neutral';
}

function getAssessmentResultLabel(params: {
  bandId: string;
  scoreDirection: AssessmentScoreDirection;
  category?: AssessmentCategory;
}): string {
  if (params.category === 'relationships') {
    if (params.bandId === 'low') return 'В отношениях сложно';
    if (params.bandId === 'moderate') return 'Есть трудные места';
    if (params.bandId === 'high') return 'В отношениях устойчиво';
  }

  if (params.category === 'self_kindness') {
    if (params.bandId === 'low') return 'Поддержки мало';
    if (params.bandId === 'moderate') return 'Поддержка средняя';
    if (params.bandId === 'high') return 'Поддержки много';
  }

  if (params.scoreDirection === 'higher_is_worse') {
    if (params.bandId === 'low') return 'Мало тревоги';
    if (params.bandId === 'mild') return 'Лёгкая тревога';
    if (params.bandId === 'moderate') return 'Умеренная тревога';
    if (params.bandId === 'high') return 'Много тревоги';
  }

  if (params.scoreDirection === 'higher_is_better') {
    if (params.bandId === 'low') return 'Низкий результат';
    if (params.bandId === 'moderate') return 'Средний результат';
    if (params.bandId === 'high') return 'Хороший результат';
  }

  return 'Результат';
}

function getAssessmentScaleSegments(params: {
  bandId: string;
  scoreDirection: AssessmentScoreDirection;
}): AssessmentResultScaleSegment[] {
  const palette =
    params.scoreDirection === 'higher_is_worse'
      ? [
          { id: 'low', activeClass: 'bg-emerald-300' },
          { id: 'mild', activeClass: 'bg-lime-200' },
          { id: 'moderate', activeClass: 'bg-amber-300' },
          { id: 'high', activeClass: 'bg-rose-300' },
        ]
      : [
          { id: 'low', activeClass: 'bg-rose-300' },
          { id: 'moderate', activeClass: 'bg-amber-300' },
          { id: 'high', activeClass: 'bg-emerald-300' },
        ];

  return palette.map((segment) => ({
    id: segment.id,
    className:
      segment.id === params.bandId
        ? `${segment.activeClass} opacity-100`
        : `${segment.activeClass} opacity-30`,
  }));
}
