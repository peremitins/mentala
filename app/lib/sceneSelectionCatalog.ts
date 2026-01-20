export interface SceneTrack {
  id: string;
  title: string;
  description: string;
  audioPath: string;
  coverPath: string;
  backgroundPath: string;
  isLoop: boolean;
  durationSeconds: number | null;
}

// Список сцен для страницы выбора атмосферы.
// Источник: server/infrastructure/db/seed-meditations.ts
export const SCENE_TRACKS: SceneTrack[] = [
  {
    id: 'mountain-stream',
    title: 'Горный ручей',
    description: 'Освежающий звук воды смывает усталость',
    audioPath: '/meditations/audio/nature/mountain-stream.m4a',
    coverPath: '/meditations/covers/mountain-stream.webp',
    backgroundPath: '/meditations/backgrounds/mountain-stream.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'rain-night',
    title: 'Ночной дождь',
    description: 'Убаюкивающий шум дождя для глубокого сна',
    audioPath: '/meditations/audio/nature/rain-night.m4a',
    coverPath: '/meditations/covers/rain-night.webp',
    backgroundPath: '/meditations/backgrounds/rain-night.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'midnight-calm',
    title: 'Ночная тишина',
    description: 'Глубокий покой спящей природы и звездного неба',
    audioPath: '/meditations/audio/nature/midnight-calm.m4a',
    coverPath: '/meditations/covers/midnight-calm.webp',
    backgroundPath: '/meditations/backgrounds/midnight-calm.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'ocean-slow',
    title: 'Дыхание океана',
    description: 'Медленные волны и спокойный ритм',
    audioPath: '/meditations/audio/nature/ocean-slow.m4a',
    coverPath: '/meditations/covers/ocean-slow.webp',
    backgroundPath: '/meditations/backgrounds/ocean-slow.webp',
    isLoop: false,
    durationSeconds: 454,
  },
  {
    id: 'fireplace-warmth',
    title: 'Теплый камин',
    description: 'Треск дров и уютное тепло',
    audioPath: '/meditations/audio/nature/fireplace-warmth.m4a',
    coverPath: '/meditations/covers/fireplace-warmth.webp',
    backgroundPath: '/meditations/backgrounds/fireplace-warmth.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'deep-calm',
    title: 'Глубокое спокойствие',
    description: 'Неспешный фон для снижения тревоги',
    audioPath: '/meditations/audio/music/deep-calm.m4a',
    coverPath: '/meditations/covers/deep-calm.webp',
    backgroundPath: '/meditations/backgrounds/deep-calm.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'healing-piano',
    title: 'Мелодия покоя',
    description: 'Тихие звуки фортепиано, возвращающие чувство безопасности',
    audioPath: '/meditations/audio/music/healing-piano.m4a',
    coverPath: '/meditations/covers/healing-piano.webp',
    backgroundPath: '/meditations/backgrounds/healing-piano.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'default',
    title: 'Стандартный фон',
    description: 'Базовая атмосфера без звука и обоев',
    audioPath: '',
    coverPath: '',
    backgroundPath: '',
    isLoop: true,
    durationSeconds: null,
  },
];

// По умолчанию показываем «Горный ручей», чтобы обои были включены.
export const DEFAULT_SCENE_ID = 'mountain-stream';

export function findSceneTrack(id?: string | null): SceneTrack | null {
  if (!id) return null;
  return SCENE_TRACKS.find((scene) => scene.id === id) ?? null;
}
