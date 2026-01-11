import type { Gender } from '@/shared/dto/onboarding';
import type { NotificationKind } from '@/shared/dto/notifications';

const IMAGE_BASE_PATH = '/notifications';

type GenderedImageSet = {
  neutral?: string[];
  male?: string[];
  female?: string[];
};

type ThemeImages = string[] | GenderedImageSet;

const COMMON_IMAGES: GenderedImageSet = {
  female: ['common/female/common_01.jpg', 'common/female/common_02.jpg'],
  male: ['common/male/common_01.jpg'],
  neutral: [
    'common/neutral/common_01.jpg',
    'common/neutral/common_02.jpg',
    'common/neutral/common_03.jpg',
    'common/neutral/common_04.jpg',
    'common/neutral/common_05.jpg',
    'common/neutral/common_06.jpg',
    'common/neutral/common_07.jpg',
    'common/neutral/common_08.jpg',
    'common/neutral/common_09.jpg',
    'common/neutral/common_10.jpg',
    'common/neutral/common_11.jpg',
    'common/neutral/common_12.jpg',
  ],
};

const THEMED_IMAGES: Record<NotificationKind, Record<string, ThemeImages>> = {
  therapy: {
    anxiety: {
      neutral: [
        'therapy/anxiety/neutral/anxiety_01.jpg',
        'therapy/anxiety/neutral/anxiety_02.jpg',
        'therapy/anxiety/neutral/anxiety_03.jpg',
        'therapy/anxiety/neutral/anxiety_04.jpg',
        'therapy/anxiety/neutral/anxiety_05.jpg',
        'therapy/anxiety/neutral/anxiety_06.jpg',
        'therapy/anxiety/neutral/anxiety_07.jpg',
        'therapy/anxiety/neutral/anxiety_08.jpg',
        'therapy/anxiety/neutral/anxiety_09.jpg',
        'therapy/anxiety/neutral/anxiety_10.jpg',
        'therapy/anxiety/neutral/anxiety_11.jpg',
        'therapy/anxiety/neutral/anxiety_12.jpg',
        'therapy/anxiety/neutral/anxiety_13.jpg',
        'therapy/anxiety/neutral/anxiety_14.jpg',
      ],
    },
    loneliness: {
      neutral: [
        'therapy/loneliness/neutral/loneliness_01.jpg',
        'therapy/loneliness/neutral/loneliness_02.jpg',
        'therapy/loneliness/neutral/loneliness_03.jpg',
        'therapy/loneliness/neutral/loneliness_04.jpg',
        'therapy/loneliness/neutral/loneliness_05.jpg',
        'therapy/loneliness/neutral/loneliness_06.jpg',
        'therapy/loneliness/neutral/loneliness_07.jpg',
        'therapy/loneliness/neutral/loneliness_08.jpg',
        'therapy/loneliness/neutral/loneliness_09.jpg',
        'therapy/loneliness/neutral/loneliness_10.jpg',
        'therapy/loneliness/neutral/loneliness_11.jpg',
        'therapy/loneliness/neutral/loneliness_12.jpg',
        'therapy/loneliness/neutral/loneliness_13.jpg',
        'therapy/loneliness/neutral/loneliness_14.jpg',
        'therapy/loneliness/neutral/loneliness_15.jpg',
        'therapy/loneliness/neutral/loneliness_16.jpg',
        'therapy/loneliness/neutral/loneliness_17.jpg',
      ],
    },
    perfectionism: {
      neutral: [
        'therapy/perfectionism/neutral/perfectionism_01.jpg',
        'therapy/perfectionism/neutral/perfectionism_02.jpg',
        'therapy/perfectionism/neutral/perfectionism_03.jpg',
        'therapy/perfectionism/neutral/perfectionism_04.jpg',
        'therapy/perfectionism/neutral/perfectionism_05.jpg',
        'therapy/perfectionism/neutral/perfectionism_06.jpg',
        'therapy/perfectionism/neutral/perfectionism_07.jpg',
        'therapy/perfectionism/neutral/perfectionism_08.jpg',
        'therapy/perfectionism/neutral/perfectionism_09.jpg',
        'therapy/perfectionism/neutral/perfectionism_10.jpg',
        'therapy/perfectionism/neutral/perfectionism_11.jpg',
        'therapy/perfectionism/neutral/perfectionism_12.jpg',
      ],
    },
  },
  habits: {
    smoking: {
      neutral: [
        'habits/smoking/neutral/smoking_01.jpg',
        'habits/smoking/neutral/smoking_02.jpg',
        'habits/smoking/neutral/smoking_03.jpg',
        'habits/smoking/neutral/smoking_04.jpg',
        'habits/smoking/neutral/smoking_05.jpg',
        'habits/smoking/neutral/smoking_06.jpg',
        'habits/smoking/neutral/smoking_07.jpg',
        'habits/smoking/neutral/smoking_08.jpg',
        'habits/smoking/neutral/smoking_09.jpg',
        'habits/smoking/neutral/smoking_10.jpg',
        'habits/smoking/neutral/smoking_11.jpg',
        'habits/smoking/neutral/smoking_12.jpg',
        'habits/smoking/neutral/smoking_13.jpg',
        'habits/smoking/neutral/smoking_14.jpg',
      ],
    },
    alcohol: {
      male: [
        'habits/alcohol/male/alcohol_01.jpg',
        'habits/alcohol/male/alcohol_02.jpg',
        'habits/alcohol/male/alcohol_03.jpg',
        'habits/alcohol/male/alcohol_04.jpg',
        'habits/alcohol/male/alcohol_05.jpg',
        'habits/alcohol/male/alcohol_06.jpg',
        'habits/alcohol/male/alcohol_07.jpg',
        'habits/alcohol/male/alcohol_08.jpg',
        'habits/alcohol/male/alcohol_09.jpg',
        'habits/alcohol/male/alcohol_10.jpg',
        'habits/alcohol/male/alcohol_11.jpg',
        'habits/alcohol/male/alcohol_12.jpg',
        'habits/alcohol/male/alcohol_13.jpg',
      ],
      female: [
        'habits/alcohol/female/alcohol_01.jpg',
        'habits/alcohol/female/alcohol_02.jpg',
        'habits/alcohol/female/alcohol_03.jpg',
        'habits/alcohol/female/alcohol_04.jpg',
        'habits/alcohol/female/alcohol_05.jpg',
        'habits/alcohol/female/alcohol_05.jpg',
        'habits/alcohol/female/alcohol_06.jpg',
        'habits/alcohol/female/alcohol_07.jpg',
        'habits/alcohol/female/alcohol_08.jpg',
        'habits/alcohol/female/alcohol_09.jpg',
        'habits/alcohol/female/alcohol_10.jpg',
      ],
      neutral: [
        'habits/alcohol/neutral/alcohol_01.jpg',
        'habits/alcohol/neutral/alcohol_02.jpg',
        'habits/alcohol/neutral/alcohol_03.jpg',
        'habits/alcohol/neutral/alcohol_04.jpg',
        'habits/alcohol/neutral/alcohol_05.jpg',
        'habits/alcohol/neutral/alcohol_06.jpg',
        'habits/alcohol/neutral/alcohol_07.jpg',
        'habits/alcohol/neutral/alcohol_08.jpg',
        'habits/alcohol/neutral/alcohol_09.jpg',
        'habits/alcohol/neutral/alcohol_10.jpg',
        'habits/alcohol/neutral/alcohol_11.jpg',
        'habits/alcohol/neutral/alcohol_12.jpg',
        'habits/alcohol/neutral/alcohol_13.jpg',
        'habits/alcohol/neutral/alcohol_14.jpg',
        'habits/alcohol/neutral/alcohol_15.jpg',
        'habits/alcohol/neutral/alcohol_16.jpg',
        'habits/alcohol/neutral/alcohol_17.jpg',
        'habits/alcohol/neutral/alcohol_18.jpg',
      ],
    },
    sugar: {
      neutral: [
        'habits/sugar/neutral/sugar_01.jpg',
        'habits/sugar/neutral/sugar_02.jpg',
        'habits/sugar/neutral/sugar_03.jpg',
        'habits/sugar/neutral/sugar_04.jpg',
      ],
    },
    junk_food: {
      male: [
        'habits/junk_food/male/junk_food_01.jpg',
        'habits/junk_food/male/junk_food_02.jpg',
      ],
      female: [
        'habits/junk_food/female/junk_food_01.jpg',
        'habits/junk_food/female/junk_food_02.jpg',
      ],
      neutral: [
        'habits/junk_food/neutral/junk_food_01.jpg',
        'habits/junk_food/neutral/junk_food_02.jpg',
        'habits/junk_food/neutral/junk_food_03.jpg',
        'habits/junk_food/neutral/junk_food_04.jpg',
        'habits/junk_food/neutral/junk_food_05.jpg',
        'habits/junk_food/neutral/junk_food_06.jpg',
        'habits/junk_food/neutral/junk_food_07.jpg',
        'habits/junk_food/neutral/junk_food_08.jpg',
        'habits/junk_food/neutral/junk_food_09.jpg',
        'habits/junk_food/neutral/junk_food_10.jpg',
        'habits/junk_food/neutral/junk_food_11.jpg',
      ],
    },
    water: {
      female: [
        'habits/water/female/water_01.jpg',
        'habits/water/female/water_02.jpg',
      ],
      male: ['habits/water/male/water_01.jpg'],
      neutral: [
        'habits/water/neutral/water_01.jpg',
        'habits/water/neutral/water_02.jpg',
        'habits/water/neutral/water_03.jpg',
        'habits/water/neutral/water_04.jpg',
        'habits/water/neutral/water_05.jpg',
        'habits/water/neutral/water_06.jpg',
      ],
    },
    steps: {
      female: [
        'habits/steps/female/steps_01.jpg',
        'habits/steps/female/steps_02.jpg',
        'habits/steps/female/steps_03.jpg',
        'habits/steps/female/steps_04.jpg',
      ],
      male: [
        'habits/steps/male/steps_01.jpg',
        'habits/steps/male/steps_02.jpg',
        'habits/steps/male/steps_03.jpg',
        'habits/steps/male/steps_04.jpg',
        'habits/steps/male/steps_05.jpg',
      ],
    },
    meditation: {
      female: [
        'habits/meditation/female/meditation_01.jpg',
        'habits/meditation/female/meditation_02.jpg',
        'habits/meditation/female/meditation_03.jpg',
        'habits/meditation/female/meditation_04.jpg',
        'habits/meditation/female/meditation_05.jpg',
        'habits/meditation/female/meditation_06.jpg',
        'habits/meditation/female/meditation_07.jpg',
        'habits/meditation/female/meditation_08.jpg',
        'habits/meditation/female/meditation_09.jpg',
        'habits/meditation/female/meditation_10.jpg',
        'habits/meditation/female/meditation_11.jpg',
        'habits/meditation/female/meditation_12.jpg',
        'habits/meditation/female/meditation_13.jpg',
        'habits/meditation/female/meditation_14.jpg',
        'habits/meditation/female/meditation_15.jpg',
      ],
      male: [
        'habits/meditation/male/meditation_01.jpg',
        'habits/meditation/male/meditation_02.jpg',
        'habits/meditation/male/meditation_03.jpg',
        'habits/meditation/male/meditation_04.jpg',
        'habits/meditation/male/meditation_05.jpg',
        'habits/meditation/male/meditation_06.jpg',
        'habits/meditation/male/meditation_07.jpg',
        'habits/meditation/male/meditation_08.jpg',
        'habits/meditation/male/meditation_09.jpg',
        'habits/meditation/male/meditation_10.jpg',
        'habits/meditation/male/meditation_11.jpg',
        'habits/meditation/male/meditation_12.jpg',
        'habits/meditation/male/meditation_13.jpg',
      ],
    },
  },
};

const IMAGE_ALLOWED_THEMES = new Set([
  'therapy:anxiety',
  'therapy:loneliness',
  'therapy:perfectionism',
  'habits:alcohol',
  'habits:water',
  'habits:steps',
  'habits:meditation',
  'habits:smoking',
  'habits:sugar',
  'habits:junk_food',
]);

type ImagePickParams = {
  kind: NotificationKind;
  entityKey?: string | null;
  gender?: Gender | null;
  sequenceIndex: number;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function resolvePublicBaseUrl(): string {
  const baseUrl = process.env.NUXT_PRIVATE_API_BASE || 'http://localhost:3000';

  return normalizeBaseUrl(baseUrl);
}

function interleaveBalanced(primary: string[], secondary: string[]): string[] {
  if (primary.length === 0) return secondary;
  if (secondary.length === 0) return primary;

  const total = primary.length + secondary.length;
  const result: string[] = [];
  let primaryIndex = 0;
  let secondaryIndex = 0;

  for (let position = 0; position < total; position += 1) {
    const secondaryTarget = Math.round(
      ((position + 1) * secondary.length) / total
    );
    if (secondaryIndex < secondaryTarget) {
      result.push(secondary[secondaryIndex]);
      secondaryIndex += 1;
    } else if (primaryIndex < primary.length) {
      result.push(primary[primaryIndex]);
      primaryIndex += 1;
    } else if (secondaryIndex < secondary.length) {
      result.push(secondary[secondaryIndex]);
      secondaryIndex += 1;
    }
  }

  return result;
}

function resolveThemeSequence(
  themeImages: ThemeImages | undefined,
  gender?: Gender | null
): string[] {
  if (!themeImages) return [];
  if (Array.isArray(themeImages)) return themeImages;

  const neutral = themeImages.neutral ?? [];
  const male = themeImages.male ?? [];
  const female = themeImages.female ?? [];
  const genderList =
    gender === 'male' ? male : gender === 'female' ? female : [];

  return interleaveBalanced(genderList, neutral);
}

export function pickNotificationImage(params: ImagePickParams): string | null {
  const { kind, entityKey, sequenceIndex, gender } = params;
  if (!entityKey || !IMAGE_ALLOWED_THEMES.has(`${kind}:${entityKey}`)) {
    return null;
  }
  const kindImages = THEMED_IMAGES[kind];
  const themeSequence =
    entityKey && kindImages
      ? resolveThemeSequence(kindImages[entityKey], gender)
      : [];
  const fallbackSequence = resolveThemeSequence(COMMON_IMAGES, gender);

  const sequence = themeSequence.length > 0 ? themeSequence : fallbackSequence;
  if (sequence.length === 0) return null;

  const safeIndex = Math.abs(sequenceIndex) % sequence.length;
  const selected = sequence[safeIndex];

  const baseUrl = resolvePublicBaseUrl();
  return `${baseUrl}${IMAGE_BASE_PATH}/${selected}`;
}
