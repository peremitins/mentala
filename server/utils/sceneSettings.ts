import { buildSceneSettingsDefaults } from '@/shared/utils/sceneSettings';

export function getDefaultUserSceneSettings() {
  const runtimeConfig = useRuntimeConfig();
  return buildSceneSettingsDefaults(
    runtimeConfig.public.sceneDefaultVolumePercent
  );
}
