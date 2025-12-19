/**
 * Seed скрипт для заполнения ролей
 * Запускать после миграции БД
 */

// Загружаем переменные окружения ПЕРЕД импортом client
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Загружаем .env файлы синхронно
const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = resolve(process.cwd(), envFile);
const envResult = config({ path: envPath });
if (envResult.error && envFile !== '.env') {
  console.warn(`Warning: Could not load ${envFile}:`, envResult.error.message);
}

// Загружаем .env как fallback
const defaultEnvResult = config({ path: resolve(process.cwd(), '.env') });
if (defaultEnvResult.error) {
  console.warn('Warning: Could not load .env:', defaultEnvResult.error.message);
}

// Проверяем наличие обязательной переменной
if (!process.env.NUXT_PRIVATE_DB_URL) {
  console.error(
    '❌ Error: NUXT_PRIVATE_DB_URL is not set in environment variables'
  );
  console.error('Please check your .env or .env.development file');
  process.exit(1);
}

// Используем динамический импорт после загрузки переменных окружения
async function runSeed() {
  // Импортируем после загрузки env
  const { db } = await import('./client');
  const { roles } = await import('./schema');

  console.log('🌱 Seeding roles...');

  const rolesData = [
    {
      id: 'admin',
      name: 'Администратор',
      description: 'Полный доступ ко всем ресурсам системы',
      isSystem: true,
    },
    {
      id: 'user',
      name: 'Пользователь',
      description: 'Обычный пользователь приложения',
      isSystem: true,
    },
    {
      id: 'moderator',
      name: 'Модератор',
      description: 'Может просматривать пользователей и блокировать их',
      isSystem: true,
    },
    {
      id: 'support',
      name: 'Служба поддержки',
      description: 'Может просматривать данные и подписки пользователей',
      isSystem: true,
    },
  ];

  // Добавляем/обновляем роли
  for (const role of rolesData) {
    try {
      await db
        .insert(roles)
        .values(role)
        .onConflictDoUpdate({
          target: roles.id,
          set: {
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            updatedAt: new Date(),
          },
        });
      console.log(`✅ Role ${role.id} seeded`);
    } catch (error) {
      console.error(`❌ Error seeding role ${role.id}:`, error);
      throw error;
    }
  }

  console.log('✅ Roles seeding completed');
}

// Запуск через tsx
runSeed()
  .then(() => {
    console.log('✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });

