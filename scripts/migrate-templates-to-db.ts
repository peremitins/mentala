/**
 * Скрипт конвертации TS-шаблонов уведомлений в БД
 * Заполняет notification_text_presets и notification_texts
 *
 * ВАЖНО: Скрипт очищает таблицы перед миграцией, чтобы избежать дублирования
 */

// Загрузка переменных окружения ДО всех импортов
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'node:fs';

// Пробуем загрузить .env из корня проекта
const envPath = resolve(process.cwd(), '.env');
const envDevPath = resolve(process.cwd(), '.env.development');
const envLocalPath = resolve(process.cwd(), '.env.local');

let envLoaded = false;
if (existsSync(envPath)) {
  const result = config({ path: envPath });
  if (!result.error) envLoaded = true;
}
if (!envLoaded && existsSync(envDevPath)) {
  const result = config({ path: envDevPath });
  if (!result.error) envLoaded = true;
}
if (!envLoaded && existsSync(envLocalPath)) {
  const result = config({ path: envLocalPath });
  if (!result.error) envLoaded = true;
}

if (!envLoaded) {
  console.warn(
    '⚠️  Файл .env не найден. Используются переменные окружения системы.'
  );
}

// Проверяем наличие обязательной переменной
if (!process.env.NUXT_PRIVATE_DB_URL) {
  console.error('❌ NUXT_PRIVATE_DB_URL не установлена!');
  console.error('   Проверьте файлы .env, .env.development или .env.local');
  process.exit(1);
}

import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import {
  notificationTexts,
  notificationTextPresets,
} from '../server/infrastructure/db/schema';
import {
  notificationTemplates,
  type NotificationTemplate,
} from '../app/lib/notificationTemplates';

// Динамический импорт клиента БД после загрузки переменных окружения
const { db } = await import('../server/infrastructure/db/client');

type Addressing = 'informal' | 'formal' | 'universal';
type Directness = 'soft' | 'moderate' | 'hard' | 'universal';

/**
 * Разворачивает шаблон в плоские записи для всех комбинаций addressing × directness
 */
function expandTemplate(template: NotificationTemplate): Array<{
  addressing: Addressing;
  directness: Directness;
  text: string;
}> {
  const results: Array<{
    addressing: Addressing;
    directness: Directness;
    text: string;
  }> = [];

  // Обрабатываем universal (если есть) - создаём записи для всех addressing и directness
  if (template.ru.universal) {
    for (const addressing of ['informal', 'formal'] as const) {
      for (const directness of ['soft', 'moderate', 'hard'] as const) {
        results.push({
          addressing,
          directness,
          text: template.ru.universal,
        });
      }
    }
  }

  // Обрабатываем addressing-специфичные тексты
  for (const [addressingKey, variants] of Object.entries(template.ru)) {
    if (addressingKey === 'universal') continue;

    const addressing = addressingKey as 'informal' | 'formal';

    // Обрабатываем universal для конкретного addressing
    if (variants && typeof variants === 'object' && 'universal' in variants) {
      for (const directness of ['soft', 'moderate', 'hard'] as const) {
        results.push({
          addressing,
          directness,
          text: variants.universal as string,
        });
      }
    }

    // Обрабатываем directness-специфичные тексты
    if (variants && typeof variants === 'object') {
      for (const [directnessKey, text] of Object.entries(variants)) {
        if (directnessKey === 'universal') continue;
        if (typeof text !== 'string') continue;

        const directness = directnessKey as 'soft' | 'moderate' | 'hard';
        results.push({
          addressing,
          directness,
          text,
        });
      }
    }
  }

  return results;
}

/**
 * Валидация шаблона перед обработкой
 */
function validateTemplate(template: NotificationTemplate): void {
  if (!template.kind || !['habits', 'therapy'].includes(template.kind)) {
    throw new Error(
      `Invalid template kind: ${template.kind} (template id: ${template.id})`
    );
  }

  if (!template.entityKey || typeof template.entityKey !== 'string') {
    throw new Error(
      `Invalid template entityKey: ${template.entityKey} (template id: ${template.id})`
    );
  }

  if (!template.ru || typeof template.ru !== 'object') {
    throw new Error(
      `Invalid template.ru: missing or not an object (template id: ${template.id})`
    );
  }

  // Валидация правила harm_*: только quit + informational + hard
  if (template.imageTag && template.imageTag.startsWith('harm_')) {
    if (template.intent !== 'quit') {
      throw new Error(
        `Invalid imageTag for template ${template.id}: harm_* разрешён только для quit`
      );
    }
    if (template.subtype !== 'informational') {
      throw new Error(
        `Invalid imageTag for template ${template.id}: harm_* разрешён только для subtype=informational`
      );
    }
    if (template.directness.some((value) => value !== 'hard')) {
      throw new Error(
        `Invalid imageTag for template ${template.id}: harm_* разрешён только для directness=hard`
      );
    }
  }
}

/**
 * Создаёт записи в presets и texts для одной комбинации
 */
async function createPresetAndText(
  template: NotificationTemplate,
  addressing: Addressing,
  directness: Directness,
  text: string,
  sortOrder: number
): Promise<void> {
  const presetId = nanoid();
  const textId = nanoid();
  const now = new Date();

  // Создаём preset (эталон)
  await db.insert(notificationTextPresets).values({
    id: presetId,
    kind: template.kind,
    entityKey: template.entityKey,
    intent: template.intent ?? null,
    subtype: template.subtype ?? null,
    imageTag: template.imageTag ?? null,
    actionHint: template.actionHint ?? null,
    directness,
    addressing,
    locale: 'ru',
    text,
    sortOrder,
  });

  // Создаём text (рабочая запись)
  await db.insert(notificationTexts).values({
    id: textId,
    kind: template.kind,
    entityKey: template.entityKey,
    userId: null, // системный дефолт
    source: 'default',
    intent: template.intent ?? null,
    subtype: template.subtype ?? null,
    imageTag: template.imageTag ?? null,
    actionHint: template.actionHint ?? null,
    directness,
    addressing,
    locale: 'ru',
    text,
    sortOrder,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Главная функция миграции
 */
async function migrateTemplates(): Promise<void> {
  const startTime = Date.now();
  console.log('🚀 Начинаем миграцию шаблонов в БД...');
  console.log(`📦 Всего шаблонов: ${notificationTemplates.length}`);

  // Валидация всех шаблонов перед началом
  console.log('🔍 Валидация шаблонов...');
  for (const template of notificationTemplates) {
    validateTemplate(template);
  }
  console.log('✅ Все шаблоны валидны');

  // Очистка таблиц перед миграцией
  console.log('🧹 Очищаем таблицы presets и texts...');
  await db.execute(
    sql`TRUNCATE TABLE notification_texts RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE notification_text_presets RESTART IDENTITY CASCADE`
  );
  console.log('✅ Таблицы очищены');

  // Подготовка данных для батч-вставки
  const presetsToInsert: Array<{
    id: string;
    kind: string;
    entityKey: string;
    intent: string | null;
    subtype: string | null;
    imageTag: string | null;
    actionHint: string | null;
    directness: string;
    addressing: string;
    locale: string;
    text: string;
    sortOrder: number;
  }> = [];

  const textsToInsert: Array<{
    id: string;
    kind: string;
    entityKey: string;
    userId: number | null;
    preferenceId: string | null;
    source: string;
    intent: string | null;
    subtype: string | null;
    imageTag: string | null;
    actionHint: string | null;
    directness: string;
    addressing: string;
    locale: string;
    text: string;
    sortOrder: number;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  let totalPresets = 0;
  let totalTexts = 0;
  const now = new Date();

  // Собираем все данные
  for (const template of notificationTemplates) {
    const expanded = expandTemplate(template);
    console.log(
      `  📝 ${template.kind}/${template.entityKey} (${template.id}): ${expanded.length} вариантов`
    );

    let sortOrder = 0;
    for (const { addressing, directness, text } of expanded) {
      const presetId = nanoid();
      const textId = nanoid();

      presetsToInsert.push({
        id: presetId,
        kind: template.kind,
        entityKey: template.entityKey,
        intent: template.intent || null,
        subtype: template.subtype || null,
        imageTag: template.imageTag ?? null,
        actionHint: template.actionHint ?? null,
        directness,
        addressing,
        locale: 'ru',
        text,
        sortOrder,
      });

      textsToInsert.push({
        id: textId,
        kind: template.kind,
        entityKey: template.entityKey,
        userId: null,
        preferenceId: null,
        source: 'default',
        intent: template.intent || null,
        subtype: template.subtype || null,
        imageTag: template.imageTag ?? null,
        actionHint: template.actionHint ?? null,
        directness,
        addressing,
        locale: 'ru',
        text,
        sortOrder,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });

      sortOrder++;
      totalPresets++;
      totalTexts++;
    }
  }

  // Батч-вставка presets
  console.log(`💾 Вставляем ${presetsToInsert.length} presets...`);
  const BATCH_SIZE = 500;
  for (let i = 0; i < presetsToInsert.length; i += BATCH_SIZE) {
    const batch = presetsToInsert.slice(i, i + BATCH_SIZE);
    await db.insert(notificationTextPresets).values(batch);
    console.log(
      `  ✅ Вставлено presets: ${Math.min(i + BATCH_SIZE, presetsToInsert.length)}/${presetsToInsert.length}`
    );
  }

  // Батч-вставка texts
  console.log(`💾 Вставляем ${textsToInsert.length} texts...`);
  for (let i = 0; i < textsToInsert.length; i += BATCH_SIZE) {
    const batch = textsToInsert.slice(i, i + BATCH_SIZE);
    await db.insert(notificationTexts).values(batch);
    console.log(
      `  ✅ Вставлено texts: ${Math.min(i + BATCH_SIZE, textsToInsert.length)}/${textsToInsert.length}`
    );
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Миграция завершена за ${duration}с!`);
  console.log(`   Создано presets: ${totalPresets}`);
  console.log(`   Создано texts: ${totalTexts}`);
}

// Запуск
(async () => {
  try {
    await migrateTemplates();
    console.log('✨ Готово!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    if (error instanceof Error) {
      console.error('   Сообщение:', error.message);
      console.error('   Стек:', error.stack);
    }
    process.exit(1);
  }
})();
