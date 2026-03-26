/**
 * Определяет, что текущий процесс запущен для статической генерации bundle.
 *
 * Нельзя завязываться на npm_lifecycle_event:
 * подмена этого значения ломает Nuxt static output и может увести release-сборку в dev-режим.
 */
export function isStaticGenerateProcess(): boolean {
  const staticGenerateFlag = String(
    process.env.MENTALA_STATIC_GENERATE || ''
  ).toLowerCase();

  return (
    process.env.NITRO_PRESET === 'static' ||
    staticGenerateFlag === 'true' ||
    staticGenerateFlag === '1'
  );
}
