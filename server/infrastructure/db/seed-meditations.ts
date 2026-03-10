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
      audioPath: '/meditations/audio/nature/rain-night.cf201c33.m4a',
      coverPath: '/meditations/covers/rain-night.9468982c.webp',
      backgroundPath: '/meditations/backgrounds/rain-night.00d147c2.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'midnight-calm',
      title: 'Ночная тишина',
      description: 'Глубокий покой спящей природы и звездного неба',
      topicKey: 'sleep',
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
      topicKey: 'sleep',
      audioPath: '/meditations/audio/nature/ocean-slow.f308203e.m4a',
      coverPath: '/meditations/covers/ocean-slow.d9647490.webp',
      backgroundPath: '/meditations/backgrounds/ocean-slow.ed61a3eb.webp',
      isLoop: false,
      durationSeconds: 454,
    },
    {
      id: 'fireplace-warmth',
      title: 'Теплый камин',
      description: 'Треск дров и уютное тепло',
      topicKey: 'sleep',
      audioPath: '/meditations/audio/nature/fireplace-warmth.fbf2d6b8.m4a',
      coverPath: '/meditations/covers/fireplace-warmth.63fca502.webp',
      backgroundPath: '/meditations/backgrounds/fireplace-warmth.fda32ea9.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'fireplace-rain',
      title: 'Камин под дождем',
      description: 'Уютное тепло очага и шум ливня за окном',
      topicKey: 'sleep',
      audioPath: '/meditations/audio/nature/fireplace-rain.a86e3fb9.m4a',
      coverPath: '/meditations/covers/fireplace-rain.9220af38.webp',
      backgroundPath: '/meditations/backgrounds/fireplace-rain.daa58630.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'delta-waves',
      title: 'Глубокий сон',
      description: 'Медленный ритм для погружения в отдых',
      topicKey: 'sleep',
      audioPath: '/meditations/audio/music/delta-waves.0203eef2.m4a',
      coverPath: '/meditations/covers/delta-waves.7d0e01fa.webp',
      backgroundPath: '/meditations/backgrounds/delta-waves.20b7c825.webp',
      isLoop: false,
      durationSeconds: 444,
    },

    // --- ANXIETY (Тревога) ---
    {
      id: 'steady-breath',
      title: 'Ровное дыхание',
      description: 'Мягкий фон для настройки дыхания',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/steady-breath.4f064dc8.m4a',
      coverPath: '/meditations/covers/steady-breath.ba6fc5db.webp',
      backgroundPath: '/meditations/backgrounds/steady-breath.0b89eead.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'deep-calm',
      title: 'Глубокое спокойствие',
      description: 'Неспешный фон для снижения тревоги',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/deep-calm.3a023bd8.m4a',
      coverPath: '/meditations/covers/deep-calm.47425d01.webp',
      backgroundPath: '/meditations/backgrounds/deep-calm.1dd89d80.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'space-texture',
      title: 'Космическая текстура',
      description: 'Обволакивающий эмбиент для глубокого погружения в себя',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/deep-space.a4756421.m4a',
      coverPath: '/meditations/covers/deep-space.dae2e2da.webp',
      backgroundPath: '/meditations/backgrounds/deep-space.8ce9218c.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'morning-light',
      title: 'Утренний свет',
      description: 'Мягкий выход из тревожного состояния',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/nature/morning-light.f72883aa.m4a',
      coverPath: '/meditations/covers/morning-light.b4b3c9fa.webp',
      backgroundPath: '/meditations/backgrounds/morning-light.3045cf4e.webp',
      isLoop: false,
      durationSeconds: 308,
    },
    {
      id: 'rainy-garden',
      title: 'Сад во время дождя',
      description: 'Свежесть капель и нежное пение птиц для снятия тревоги',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/nature/rainy-garden.a983b78e.m4a',
      coverPath: '/meditations/covers/rainy-garden.0f075c19.webp',
      backgroundPath: '/meditations/backgrounds/rainy-garden.867371f7.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'deep-relaxation',
      title: 'Глубокое расслабление',
      description: 'Обволакивающие звуки для снятия напряжения и тревоги',
      topicKey: 'anxiety',
      audioPath: '/meditations/audio/music/deep-relaxation.1065f540.m4a',
      coverPath: '/meditations/covers/deep-relaxation.0406e33f.webp',
      backgroundPath: '/meditations/backgrounds/deep-relaxation.18c58ff3.webp',
      isLoop: true,
      durationSeconds: null,
    },

    // --- STRESS (Стресс) ---
    {
      id: 'birds-stream',
      title: 'Пение птиц и ручей',
      description: 'Природные звуки для мягкого расслабления',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/birds-stream.741813ef.m4a',
      coverPath: '/meditations/covers/birds-stream.fca116fe.webp',
      backgroundPath: '/meditations/backgrounds/birds-stream.d154d339.webp',
      isLoop: false,
      durationSeconds: 601,
    },
    {
      id: 'lake-mist-rain',
      title: 'Дождь над озером',
      description: 'Мягкое шуршание капель по воде для снятия напряжения',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/lake-mist-rain.f3dcd9f6.m4a',
      coverPath: '/meditations/covers/lake-mist-rain.ce7be190.webp',
      backgroundPath: '/meditations/backgrounds/lake-mist-rain.e11af4c0.webp',
      isLoop: false,
      durationSeconds: 563,
    },
    {
      id: 'mountain-stream',
      title: 'Горный ручей',
      description: 'Освежающий звук воды смывает усталость',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/mountain-stream.760c589b.m4a',
      coverPath: '/meditations/covers/mountain-stream.6acc5b7c.webp',
      backgroundPath: '/meditations/backgrounds/mountain-stream.abe4c69e.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'zen-garden',
      title: 'Сад камней',
      description: 'Минималистичный фон для тишины внутри',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/zen-garden.4252bbcc.m4a',
      coverPath: '/meditations/covers/zen-garden.311bcf16.webp',
      backgroundPath: '/meditations/backgrounds/zen-garden.cc79dae1.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'evening-lake',
      title: 'Тихий вечер',
      description: 'Звуки природы для завершения тяжелого дня',
      topicKey: 'stress',
      audioPath: '/meditations/audio/nature/evening-lake.84f3cba7.m4a',
      coverPath: '/meditations/covers/evening-lake.e5166c49.webp',
      backgroundPath: '/meditations/backgrounds/evening-lake.bd688a76.webp',
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
      audioPath: '/meditations/audio/music/healing-piano.13b29a17.m4a',
      coverPath: '/meditations/covers/healing-piano.10e2f3ec.webp',
      backgroundPath: '/meditations/backgrounds/healing-piano.77986ca5.webp',
      isLoop: true,
      durationSeconds: null,
    },
    {
      id: 'ultimate-relaxation',
      title: 'Состояние покоя',
      description: 'Глубокий фон для полного расслабления и восстановления',
      topicKey: 'stress',
      topicKeys: ['anxiety', 'stress'],
      audioPath: '/meditations/audio/music/ultimate-relaxation.4173679d.m4a',
      coverPath: '/meditations/covers/ultimate-relaxation.ccf3edac.webp',
      backgroundPath:
        '/meditations/backgrounds/ultimate-relaxation.6d6d9607.webp',
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
