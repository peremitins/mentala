import type { SosEntry } from '@/app/composables/useSos';

type QuickHelpStep = 'panic-grounding' | 'panic-breathing' | 'tension-practice';

type QuickHelpAction =
  | { type: 'set_step'; step: QuickHelpStep }
  | { type: 'go_chat'; entry: SosEntry }
  | { type: 'navigate'; to: string };

export interface QuickHelpCard {
  id: string;
  title: string;
  subtitle: string;
  action: QuickHelpAction;
}

export const QUICK_HELP_CARDS: QuickHelpCard[] = [
  {
    id: 'grounding-54321',
    title: '5-4-3-2-1',
    subtitle: 'Заземление через наблюдение и ощущения',
    action: {
      type: 'set_step',
      step: 'panic-grounding',
    },
  },
  {
    id: 'tension-release',
    title: 'Снять напряжение в теле',
    subtitle: 'Короткая практика напряжения и расслабления',
    action: {
      type: 'set_step',
      step: 'tension-practice',
    },
  },
  {
    id: 'thought-dump',
    title: 'Выгрузка мыслей',
    subtitle: 'Быстро разгрузить голову и выплеснуть эмоции',
    action: {
      type: 'navigate',
      to: '/quick-help/thought-dump',
    },
  },
];
