// 15 стадий роста растения (раньше было 16). Канонически первая стадия уже
// должна показывать начало живого роста без отдельной фазы семени; для уже
// утверждённых наборов ниже есть plant-set-specific подписи под фактические
// изображения.
// См. .docs/retention/retention_long_term_strategy.md.
export const RETENTION_PLANT_STATE_COUNT = 15;
export const RETENTION_PLANT_IMAGE_EXTENSION = 'webp';
export const RETENTION_PLANT_IMAGE_DIR = '/retention/plant/states';

export const RETENTION_PLANT_TITLES = [
  'Начало роста',
  'Первые листья',
  'Листья раскрываются',
  'Растение крепнет',
  'Крона набирает форму',
  'Зелёная масса растёт',
  'Появляется бутон',
  'Бутоны набирают силу',
  'Бутоны округляются',
  'Цвет готовится раскрыться',
  'Первые лепестки',
  'Цветок раскрывается',
  'Цветение набирает форму',
  'Цветение почти полное',
  'Пышное цветение',
] as const;

const RETENTION_PLANT_SET_TITLES: Record<string, readonly string[]> = {
  // Текущий orchid-set цветёт раньше канонической шкалы: первые цветы уже
  // видны на plant-04.webp. До регенерации ассетов держим подписи
  // синхронными с фактическими картинками, а не с идеальной ботанической
  // последовательностью.
  orchid: [
    'Листья раскрылись',
    'Розетка крепнет',
    'Цветоносы растут',
    'Первые цветы',
    'Цветоносы набирают силу',
    'Цветение начинается',
    'Цветы раскрываются',
    'Цветение крепнет',
    'Цветов становится больше',
    'Орхидея расцветает',
    'Цветение становится пышнее',
    'Три ветви цветут',
    'Цветение набирает объём',
    'Орхидея почти в полном цвету',
    'Пышное цветение',
  ],
  // Текущий peony-set стартует с горшка и почвы, бутоны появляются с
  // plant-07.webp, первые раскрытые цветы — с plant-11.webp.
  peony: [
    'Появился росток',
    'Первые листья',
    'Пион крепнет',
    'Листья раскрываются',
    'Куст становится плотнее',
    'Крона набирает силу',
    'Появились бутоны',
    'Бутоны подрастают',
    'Бутоны наливаются',
    'Бутоны крепнут',
    'Первые цветы',
    'Цветы раскрываются',
    'Цветение набирает форму',
    'Пион почти расцвёл',
    'Пышное цветение',
  ],
};

export function getRetentionPlantStepThresholds(totalSteps: number): number[] {
  const safeTotal = Math.max(1, Math.floor(totalSteps));
  return Array.from({ length: RETENTION_PLANT_STATE_COUNT }, (_, index) => {
    if (index === 0) return 0;
    if (index === RETENTION_PLANT_STATE_COUNT - 1) return safeTotal;

    // Стадии равномерно раскладываются по любой длине программы:
    // 30 шагов -> примерно каждые 2 шага, 21 шаг -> чередование 1-2 шага.
    return Math.min(
      safeTotal,
      Math.max(1, Math.ceil((safeTotal * index) / RETENTION_PLANT_STATE_COUNT))
    );
  });
}

export function getRetentionPlantStateIndex(
  completedSteps: number,
  totalSteps: number
) {
  const safeTotal = Math.max(1, totalSteps);
  const clampedSteps = Math.max(0, Math.min(completedSteps, safeTotal));

  const thresholds = getRetentionPlantStepThresholds(safeTotal);
  let index = 0;
  for (const [thresholdIndex, threshold] of thresholds.entries()) {
    if (clampedSteps >= threshold) {
      index = thresholdIndex;
    }
  }
  return index;
}

export function getRetentionPlantNextThreshold(
  stateIndex: number,
  totalSteps: number
) {
  const nextStateIndex = stateIndex + 1;
  if (nextStateIndex >= RETENTION_PLANT_STATE_COUNT) return null;

  return getRetentionPlantStepThresholds(totalSteps)[nextStateIndex] ?? null;
}

export function getRetentionPlantTitle(
  stateIndex: number,
  plantSetSlug?: string | null
) {
  const normalizedSlug =
    typeof plantSetSlug === 'string' ? plantSetSlug.trim() : '';
  const titles = normalizedSlug
    ? RETENTION_PLANT_SET_TITLES[normalizedSlug] || RETENTION_PLANT_TITLES
    : RETENTION_PLANT_TITLES;
  return titles[stateIndex] ?? titles[0];
}

/**
 * Возвращает URL картинки растения для указанной стадии и набора ассетов.
 *
 * `plantSetSlug` — slug растения из `programs.plant_set_slug` (`orchid`, `peony`,
 * `sunflower` и т.д.). Файлы лежат в `public/retention/plant/states/{slug}/plant-NN.webp`.
 *
 * Backward compat: если `plantSetSlug` не передан, возвращается путь без подпапки —
 * `/retention/plant/states/plant-NN.webp`. Так работал старый код (одно растение
 * на всё приложение). Сейчас этот путь не указывает на реальные файлы (мы их
 * перенесли в подпапки), но он остаётся допустимым return-значением, который
 * корректно отвалится в fallback через `onerror`.
 */
export function getRetentionPlantImageSrc(
  stateIndex: number,
  plantSetSlug?: string | null
) {
  const imageNumber = String(stateIndex + 1).padStart(2, '0');
  const setSegment =
    typeof plantSetSlug === 'string' && plantSetSlug.trim().length > 0
      ? `/${plantSetSlug.trim()}`
      : '';
  return `${RETENTION_PLANT_IMAGE_DIR}${setSegment}/plant-${imageNumber}.${RETENTION_PLANT_IMAGE_EXTENSION}`;
}

export function getRetentionPlantFallbackSrc(stateIndex: number) {
  const fallbackState = Math.min(
    7,
    Math.max(1, Math.ceil(((stateIndex + 1) / RETENTION_PLANT_STATE_COUNT) * 7))
  );
  return `/retention/plant/stage-${fallbackState}.svg`;
}
