export const SCENE_SETTINGS_VOLUME_MIN = 0;
export const SCENE_SETTINGS_VOLUME_MAX = 100;
export const SCENE_SETTINGS_DEFAULT_VOLUME_PERCENT = 25;
export const SCENE_SETTINGS_DEFAULT_BACKGROUND_PLAY_MINUTES = 0;
export const SCENE_SETTINGS_DEFAULT_ANIMATE_BACKGROUND = false;

function clampInteger(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, safe));
}

export function normalizeSceneVolumePercent(
  value: unknown,
  fallback = SCENE_SETTINGS_DEFAULT_VOLUME_PERCENT
) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return clampInteger(
      fallback,
      SCENE_SETTINGS_VOLUME_MIN,
      SCENE_SETTINGS_VOLUME_MAX
    );
  }

  return clampInteger(
    numeric,
    SCENE_SETTINGS_VOLUME_MIN,
    SCENE_SETTINGS_VOLUME_MAX
  );
}

export function resolveSceneDefaultVolumePercent(value?: unknown) {
  return normalizeSceneVolumePercent(
    value,
    SCENE_SETTINGS_DEFAULT_VOLUME_PERCENT
  );
}

export function buildSceneSettingsDefaults(defaultVolumePercent?: unknown) {
  return {
    volume: resolveSceneDefaultVolumePercent(defaultVolumePercent),
    backgroundPlayMinutes: SCENE_SETTINGS_DEFAULT_BACKGROUND_PLAY_MINUTES,
    animateBackground: SCENE_SETTINGS_DEFAULT_ANIMATE_BACKGROUND,
  };
}
