/**
 * Seed-скрипт политик доступа к функциям (lock/paywall).
 * Запускать после миграций.
 */

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
  process.exit(1);
}

const policies = [
  {
    featureKey: 'meditations.library.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Полная библиотека медитаций в PRO и Premium',
    paywallDescription:
      'Открой полный каталог медитаций на тарифе PRO или Premium и подбирай практики под состояние.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'breath.catalog.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Полный каталог дыхательных практик в PRO и Premium',
    paywallDescription:
      'На текущем тарифе доступны только базовые практики. Подключи PRO или Premium, чтобы открыть весь каталог.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'quick_help.practice',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Быстрые практики доступны в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы использовать быстрые техники поддержки после пробного периода.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'breath.custom.create',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Создание своих практик в Premium',
    paywallDescription:
      'Создавай персональные дыхательные практики и сохраняй их в свой список на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'breath.custom.manage',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Управление своими практиками в Premium',
    paywallDescription:
      'Редактирование и удаление персональных практик доступно на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'habits.custom.create',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Свои темы привычек в Premium',
    paywallDescription:
      'Создавай и настраивай персональные привычки с собственными текстами и расписанием на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'therapy.custom.create',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Свои темы терапии в Premium',
    paywallDescription:
      'Создавай личные темы терапии и управляй напоминаниями под свой запрос на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'gratitude.diary.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Дневник благодарности в PRO и Premium',
    paywallDescription:
      'Открой дневник благодарности на тарифе PRO или Premium, чтобы вести записи, сохранять streak и возвращаться к своим опорам.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'assessments.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Оценка состояния доступна в PRO',
    paywallDescription:
      'Пройди короткий опросник, сохрани результат и сравни динамику после сада.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'gratitude.worksheet.customize',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Кастомный шаблон дневника в Premium',
    paywallDescription:
      'Редактирование личного шаблона записи в дневнике благодарности доступно на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'gratitude.photo.upload',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Фото в записях дневника в Premium',
    paywallDescription:
      'Добавление фото к записям в дневнике благодарности доступно на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'sos.chat_handoff',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Продолжение в ИИ-чате в PRO и Premium',
    paywallDescription:
      'После SOS-техники можно продолжить поддержку в ИИ-чате на тарифе PRO или Premium.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'chat.assistant',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'ИИ-чат доступен в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы общаться с ассистентом в чате.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'chat.realtime_voice',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Realtime voice доступен в Premium',
    paywallDescription:
      'Подключи Premium, чтобы вести живой голосовой диалог с ассистентом в реальном времени.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'notifications.text_source_ai',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'ИИ-напоминания в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы получать персональные напоминания, сгенерированные ИИ.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'notifications.custom_prompt_ai',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Кастомный ИИ-промпт в Premium',
    paywallDescription:
      'Настраивай стиль и содержание ИИ-напоминаний под себя на тарифе Premium.',
    paywallCtaText: 'Перейти на Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'programs.roadmap.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Программы и сады доступны в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы проходить шаги программ и растить сады.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
] as const;

async function runSeed() {
  const { db } = await import('./client');
  const { featureAccessPolicies } = await import('./schema');

  console.log('🌱 Seeding feature access policies...');

  for (const policy of policies) {
    try {
      await db
        .insert(featureAccessPolicies)
        .values(policy)
        .onConflictDoUpdate({
          target: featureAccessPolicies.featureKey,
          set: {
            requiredPlan: policy.requiredPlan,
            trialUnlocked: policy.trialUnlocked,
            lockIcon: policy.lockIcon,
            paywallTitle: policy.paywallTitle,
            paywallDescription: policy.paywallDescription,
            paywallCtaText: policy.paywallCtaText,
            paywallTargetPlan: policy.paywallTargetPlan,
            updatedAt: new Date(),
          },
        });
      console.log(`✅ Policy ${policy.featureKey} seeded`);
    } catch (error) {
      console.error(`❌ Error seeding ${policy.featureKey}:`, error);
    }
  }

  console.log('✅ Feature access policies seeding completed');
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
