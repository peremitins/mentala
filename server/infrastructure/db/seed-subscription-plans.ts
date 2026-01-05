/**
 * Seed скрипт для заполнения тарифных планов
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

const plans = [
  // Basic
  {
    id: 'basic',
    name: 'basic',
    basePrice: '0',
    weeklyMinutesLimit: 0, // Без Trial = 0 минут, только уведомления
    avatarEnabled: false,
    pricePerMinuteGPT: '0.66',
    pricePerMinuteAvatar: '0.9',
    isCustomConfigurable: false,
    isVisibleInUI: true,
  },
  // PRO
  {
    id: 'pro',
    name: 'pro',
    basePrice: '349',
    weeklyMinutesLimit: 100,
    avatarEnabled: false,
    pricePerMinuteGPT: '0.66',
    pricePerMinuteAvatar: '0.9',
    isCustomConfigurable: false,
    isVisibleInUI: true,
  },
  // Premium
  {
    id: 'premium',
    name: 'premium',
    basePrice: '649',
    weeklyMinutesLimit: 100,
    avatarEnabled: false,
    pricePerMinuteGPT: '0.66',
    pricePerMinuteAvatar: '0.9',
    isCustomConfigurable: false,
    isVisibleInUI: true,
  },
  // Custom
  {
    id: 'custom',
    name: 'custom',
    basePrice: '349', // базовая цена PRO
    weeklyMinutesLimit: 100, // дефолтное значение, реальное задается пользователем
    avatarEnabled: false, // дефолтное значение, реальное задается пользователем
    pricePerMinuteGPT: '0.66',
    pricePerMinuteAvatar: '0.9',
    isCustomConfigurable: true,
    isVisibleInUI: true,
  },
];

// Используем динамический импорт после загрузки переменных окружения
async function runSeed() {
  // Импортируем после загрузки env
  const { db } = await import('./client');
  const { subscriptionPlans } = await import('./schema');

  console.log('🌱 Seeding subscription plans...');

  // Удаляем старые планы, которых больше нет в новой архитектуре
  const { sql: drizzleSql } = await import('drizzle-orm');
  const oldPlanIds = [
    'pro_monthly',
    'pro_yearly',
    'premium_monthly',
    'premium_yearly',
    'trial', // Trial больше не отдельный план, а состояние Basic
  ];

  for (const oldId of oldPlanIds) {
    try {
      await db.execute(
        drizzleSql`DELETE FROM subscription_plans WHERE id = ${oldId}`
      );
      console.log(`🗑️  Deleted old plan: ${oldId}`);
    } catch (error) {
      // Игнорируем ошибки, если плана уже нет
      console.log(
        `ℹ️  Plan ${oldId} not found (already deleted or never existed)`
      );
    }
  }

  // Добавляем/обновляем новые планы
  for (const plan of plans) {
    try {
      await db
        .insert(subscriptionPlans)
        .values(plan)
        .onConflictDoUpdate({
          target: subscriptionPlans.id,
          set: {
            name: plan.name,
            basePrice: plan.basePrice,
            weeklyMinutesLimit: plan.weeklyMinutesLimit,
            avatarEnabled: plan.avatarEnabled,
            pricePerMinuteGPT: plan.pricePerMinuteGPT,
            pricePerMinuteAvatar: plan.pricePerMinuteAvatar,
            isCustomConfigurable: plan.isCustomConfigurable,
            isVisibleInUI: plan.isVisibleInUI,
            updatedAt: new Date(),
          },
        });
      console.log(`✅ Plan ${plan.id} seeded`);
    } catch (error) {
      console.error(`❌ Error seeding plan ${plan.id}:`, error);
    }
  }

  console.log('✅ Subscription plans seeding completed');
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
