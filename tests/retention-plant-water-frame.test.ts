import { describe, expect, it } from 'vitest';
import { buildRetentionPlantWaterFrameVars } from '../app/utils/retentionPlantWaterFrame';

describe('retention plant water frame vars', () => {
  it('оставляет home-анимацию в прежнем 96px масштабе', () => {
    expect(buildRetentionPlantWaterFrameVars(96)).toMatchObject({
      '--plant-water-drop-top': '-8px',
      '--plant-water-drop-width': '4px',
      '--plant-water-drop-height': '7px',
      '--plant-water-drop-fall': '74px',
    });
  });

  it('масштабирует падение капель для компактного 36px хедера', () => {
    const vars = buildRetentionPlantWaterFrameVars(36);

    expect(vars['--plant-water-drop-fall']).toBe('27.75px');
    expect(vars['--plant-water-drop-top']).toBe('-3px');
    expect(vars['--plant-water-drop-width']).toBe('1.5px');
    expect(vars['--plant-water-drop-height']).toBe('2.63px');
  });
});
