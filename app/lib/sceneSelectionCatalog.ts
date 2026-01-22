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
    audioPath: '/meditations/audio/nature/mountain-stream.760c589b.m4a',
    coverPath: '/meditations/covers/mountain-stream.6acc5b7c.webp',
    backgroundPath: '/meditations/backgrounds/mountain-stream.abe4c69e.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'rain-night',
    title: 'Ночной дождь',
    description: 'Убаюкивающий шум дождя для глубокого сна',
    audioPath: '/meditations/audio/nature/rain-night.cf201c33.m4a',
    coverPath: '/meditations/covers/rain-night.6c73e019.webp',
    backgroundPath: '/meditations/backgrounds/rain-night.405ab09f.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'midnight-calm',
    title: 'Ночная тишина',
    description: 'Глубокий покой спящей природы и звездного неба',
    audioPath: '/meditations/audio/nature/midnight-calm.2240f8b8.m4a',
    coverPath: '/meditations/covers/midnight-calm.3360b86b.webp',
    backgroundPath: '/meditations/backgrounds/midnight-calm.51791d18.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'ocean-slow',
    title: 'Дыхание океана',
    description: 'Медленные волны и спокойный ритм',
    audioPath: '/meditations/audio/nature/ocean-slow.f308203e.m4a',
    coverPath: '/meditations/covers/ocean-slow.fd27232b.webp',
    backgroundPath: '/meditations/backgrounds/ocean-slow.08de5010.webp',
    isLoop: false,
    durationSeconds: 454,
  },
  {
    id: 'fireplace-warmth',
    title: 'Теплый камин',
    description: 'Треск дров и уютное тепло',
    audioPath: '/meditations/audio/nature/fireplace-warmth.fbf2d6b8.m4a',
    coverPath: '/meditations/covers/fireplace-warmth.63fca502.webp',
    backgroundPath: '/meditations/backgrounds/fireplace-warmth.fda32ea9.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'deep-calm',
    title: 'Глубокое спокойствие',
    description: 'Неспешный фон для снижения тревоги',
    audioPath: '/meditations/audio/music/deep-calm.3a023bd8.m4a',
    coverPath: '/meditations/covers/deep-calm.47425d01.webp',
    backgroundPath: '/meditations/backgrounds/deep-calm.1dd89d80.webp',
    isLoop: true,
    durationSeconds: null,
  },
  {
    id: 'healing-piano',
    title: 'Мелодия покоя',
    description: 'Тихие звуки фортепиано, возвращающие чувство безопасности',
    audioPath: '/meditations/audio/music/healing-piano.13b29a17.m4a',
    coverPath: '/meditations/covers/healing-piano.10e2f3ec.webp',
    backgroundPath: '/meditations/backgrounds/healing-piano.77986ca5.webp',
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
