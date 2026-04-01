import { normalizePluralChoice } from '@/i18n/rules/numbers';

export function ruPluralizationRules(
  choice: number,
  choicesLength: number
): number {
  const normalizedChoice = normalizePluralChoice(choice);

  if (normalizedChoice === 0) {
    return 0;
  }

  const teen = normalizedChoice > 10 && normalizedChoice < 20;
  const endsWithOne = normalizedChoice % 10 === 1;
  if (!teen && endsWithOne) {
    return 1;
  }
  if (!teen && normalizedChoice % 10 >= 2 && normalizedChoice % 10 <= 4) {
    return 2;
  }

  return choicesLength < 4 ? 2 : 3;
}

export default {
  ru: ruPluralizationRules,
};
