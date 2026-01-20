/**
 * Seed скрипт для заполнения каталога медитаций
 * Запускать после миграции БД
 */

// Загружаем переменные окружения ПЕРЕД импортом client
import { config } from 'dotenv';
import { resolve } from 'node:path';

const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = resolve(process.cwd(), envFile);
const envResult = config({ path: envPath });
if (envResult.error && envFile !== '.env') {
  console.warn(`Warning: Could not load ${envFile}:`, envResult.error.message);
}

const defaultEnvResult = config({ path: resolve(process.cwd(), '.env') });
if (defaultEnvResult.error) {
  console.warn('Warning: Could not load .env:', defaultEnvResult.error.message);
}

if (!process.env.NUXT_PRIVATE_DB_URL) {
  console.error(
    '❌ Error: NUXT_PRIVATE_DB_URL is not set in environment variables'
  );
  console.error('Please check your .env or .env.development file');
  process.exit(1);
}

async function runSeed() {
  const { db } = await import('./client');
  const { meditationTracks } = await import('./schema');

  console.log('🌱 Seeding meditation tracks...');

  const now = new Date();

  // Чистим таблицу перед загрузкой новых данных
  await db.delete(meditationTracks);

  const tracks = [
    // --- SLEEP (Сон) ---
    {
      id: 'rain-night',
      title: 'Ночной дождь',
      description: 'Убаюкивающий шум дождя для глубокого сна',
      topicKey: 'sleep',
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
      topicKey: 'sleep',
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
      topicKey: 'sleep',
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
      topicKey: 'sleep',
      audioPath: '/meditations/audio/nature/fireplace-warmth.m4a',
      coverPath: '/meditations/covers/fireplace-warmth.webp',
      backgroundPath: '/meditations/backgrounds/fireplace-warmth.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'fireplace-rain',
      title: 'Камин под дождем',
      description: 'Уютное тепло очага и шум ливня за окном',
      topicKey: 'sleep',
      audioPath: '/meditations/audio/nature/fireplace-rain.m4a',
      coverPath: '/meditations/covers/fireplace-rain.webp',
      backgroundPath: '/meditations/backgrounds/fireplace-rain.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'delta-waves',
      title: 'Глубокий сон',
      description: 'Медленный ритм для погружения в отдых',
      topicKey: 'sleep',
      audioPath: '/meditations/audio/music/delta-waves.m4a',
      coverPath: '/meditations/covers/delta-waves.webp',
      backgroundPath: '/meditations/backgrounds/delta-waves.webp',
      isLoop: false,
      durationSeconds: 444,
    },

    // --- ANXIETY (Тревога) ---
    {
      id: 'steady-breath',
      title: 'Ровное дыхание',
      description: 'Мягкий фон для настройки дыхания',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/steady-breath.m4a',
      coverPath: '/meditations/covers/steady-breath.webp',
      backgroundPath: '/meditations/backgrounds/steady-breath.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'deep-calm',
      title: 'Глубокое спокойствие',
      description: 'Неспешный фон для снижения тревоги',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/deep-calm.m4a',
      coverPath: '/meditations/covers/deep-calm.webp',
      backgroundPath: '/meditations/backgrounds/deep-calm.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'space-texture',
      title: 'Космическая текстура',
      description: 'Обволакивающий эмбиент для глубокого погружения в себя',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/deep-space.m4a',
      coverPath: '/meditations/covers/deep-space.webp',
      backgroundPath: '/meditations/backgrounds/deep-space.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'morning-light',
      title: 'Утренний свет',
      description: 'Мягкий выход из тревожного состояния',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/nature/morning-light.m4a',
      coverPath: '/meditations/covers/morning-light.webp',
      backgroundPath: '/meditations/backgrounds/morning-light.webp',
      isLoop: false,
      durationSeconds: 308,
    },
    {
      id: 'rainy-garden',
      title: 'Сад во время дождя',
      description: 'Свежесть капель и нежное пение птиц для снятия тревоги',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/nature/rainy-garden.m4a',
      coverPath: '/meditations/covers/rainy-garden.webp',
      backgroundPath: '/meditations/backgrounds/rainy-garden.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'deep-relaxation',
      title: 'Глубокое расслабление',
      description: 'Обволакивающие звуки для снятия напряжения и тревоги',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/deep-relaxation.m4a',
      coverPath: '/meditations/covers/deep-relaxation.webp',
      backgroundPath: '/meditations/backgrounds/deep-relaxation.webp',
      isLoop: true,
      durationSeconds: null,
    },

    // --- STRESS (Стресс) ---
    {
      id: 'birds-stream',
      title: 'Пение птиц и ручей',
      description: 'Природные звуки для мягкого расслабления',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/birds-stream.m4a',
      coverPath: '/meditations/covers/birds-stream.webp',
      backgroundPath: '/meditations/backgrounds/birds-stream.webp',
      isLoop: false,
      durationSeconds: 601,
    },
    {
      id: 'lake-mist-rain',
      title: 'Дождь над озером',
      description: 'Мягкое шуршание капель по воде для снятия напряжения',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/lake-mist-rain.m4a',
      coverPath: '/meditations/covers/lake-mist-rain.webp',
      backgroundPath: '/meditations/backgrounds/lake-mist-rain.webp',
      isLoop: false,
      durationSeconds: 563,
    },
    {
      id: 'mountain-stream',
      title: 'Горный ручей',
      description: 'Освежающий звук воды смывает усталость',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/mountain-stream.m4a',
      coverPath: '/meditations/covers/mountain-stream.webp',
      backgroundPath: '/meditations/backgrounds/mountain-stream.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'zen-garden',
      title: 'Сад камней',
      description: 'Минималистичный фон для тишины внутри',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/zen-garden.m4a',
      coverPath: '/meditations/covers/zen-garden.webp',
      backgroundPath: '/meditations/backgrounds/zen-garden.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'evening-lake',
      title: 'Тихий вечер',
      description: 'Звуки природы для завершения тяжелого дня',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/evening-lake.m4a',
      coverPath: '/meditations/covers/evening-lake.webp',
      backgroundPath: '/meditations/backgrounds/evening-lake.webp',
      isLoop: false,
      durationSeconds: 483,
    },

    // --- Multiple Topics ---
    {
      id: 'healing-piano',
      title: 'Мелодия покоя',
      description: 'Тихие звуки фортепиано, возвращающие чувство безопасности',
      topicKey: 'anxiety',
      topicKeys: ['anxiety', 'stress'],
      audioPath: '/meditations/audio/music/healing-piano.m4a',
      coverPath: '/meditations/covers/healing-piano.webp',
      backgroundPath: '/meditations/backgrounds/healing-piano.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'ultimate-relaxation',
      title: 'Состояние покоя',
      description: 'Глубокий фон для полного расслабления и восстановления',
      topicKey: 'stress',
      topicKeys: ['anxiety', 'stress'],
      audioPath: '/meditations/audio/music/ultimate-relaxation.m4a',
      coverPath: '/meditations/covers/ultimate-relaxation.webp',
      backgroundPath: '/meditations/backgrounds/ultimate-relaxation.webp',
      isLoop: false,
      durationSeconds: 830,
    },
  ];

  for (const track of tracks) {
    await db
      .insert(meditationTracks)
      .values({
        ...track,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: meditationTracks.id,
        set: {
          title: track.title,
          description: track.description,
          topicKey: track.topicKey,
          topicKeys: track.topicKeys ?? [],
          audioPath: track.audioPath,
          coverPath: track.coverPath,
          backgroundPath: track.backgroundPath,
          isLoop: track.isLoop,
          durationSeconds: track.durationSeconds,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`✅ Seeded ${tracks.length} meditation tracks`);
}

runSeed()
  .then(() => {
    console.log('✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
