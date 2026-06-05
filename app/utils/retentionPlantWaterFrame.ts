export type RetentionPlantWaterFrameVars = Record<string, string>;

const BASE_FRAME_PX = 96;
const BASE_DROP_FALL_PX = 74;
const BASE_DROP_TOP_PX = -8;
const BASE_DROP_WIDTH_PX = 4;
const BASE_DROP_HEIGHT_PX = 7;
const BASE_DROP_BORDER_PX = 0.7;
const BASE_DROP_START_Y_PX = -12;
const BASE_DROP_DRIFT_PX = 8;

function roundCssPx(value: number) {
  return `${Number(value.toFixed(2))}px`;
}

export function buildRetentionPlantWaterFrameVars(
  framePx: number
): RetentionPlantWaterFrameVars {
  const safeFramePx = Math.max(24, framePx);
  const scale = safeFramePx / BASE_FRAME_PX;

  return {
    '--plant-water-drop-top': roundCssPx(BASE_DROP_TOP_PX * scale),
    '--plant-water-drop-width': roundCssPx(BASE_DROP_WIDTH_PX * scale),
    '--plant-water-drop-height': roundCssPx(BASE_DROP_HEIGHT_PX * scale),
    '--plant-water-drop-border': roundCssPx(
      Math.max(0.45, BASE_DROP_BORDER_PX * scale)
    ),
    '--plant-water-drop-start-y': roundCssPx(BASE_DROP_START_Y_PX * scale),
    '--plant-water-drop-fall': roundCssPx(BASE_DROP_FALL_PX * scale),
    '--plant-water-drop-drift-base': roundCssPx(BASE_DROP_DRIFT_PX * scale),
  };
}
