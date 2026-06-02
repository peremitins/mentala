import { describe, expect, it } from 'vitest';
import {
  buildMoodAnxietyChartOptions,
  buildMoodAnxietyChartSeries,
} from '../app/components/garden/moodAnxietyChartConfig';

describe('mood anxiety chart config', () => {
  it('создаёт только одну yaxis, когда есть только одна серия', () => {
    const series = buildMoodAnxietyChartSeries({
      anxietyTimeline: [
        {
          stepNumber: 7,
          label: 'Тревога',
          value: 6,
          min: 0,
          max: 10,
          createdAt: '2026-05-26T09:00:00.000Z',
        },
      ],
      moodTimeline: [],
    });

    const options = buildMoodAnxietyChartOptions({
      compact: false,
      hasAnxiety: true,
      hasMood: false,
      anxietyMin: 0,
      anxietyMax: 10,
    });

    expect(series).toHaveLength(1);
    expect(options.yaxis).toHaveLength(1);
    expect(options.yaxis[0]?.seriesName).toBe('Тревога');
  });
});
