/**
 * Сервис для выбора текста уведомлений
 * Инкапсулирует логику выбора между шаблонными и AI-текстами
 */

import { hashNotificationText } from './ai-generation.service';
import { formatNotificationText } from '@/shared/utils/notificationText';
import type {
  NotificationSubtype,
  NotificationActionHint,
} from '@/shared/dto/notifications';
import type { AiNotificationText } from './ai-generation.service';

/**
 * Состояние выбора текста для отслеживания использованных текстов
 */
export interface TextSelectionState {
  usedTexts: Set<string>; // общий Set для AI и шаблонов (но при сбросе очищаются только шаблоны)
  usedTemplateIndices: Set<number>;
  usedTemplateHashes: Set<string>;
  usedAiIndices: Set<number>;
  usedAiHashes: Set<string>;
}

/**
 * Параметры для выбора текста
 */
export interface PickTextParams {
  slotIndex: number;
  textSource: 'templates' | 'ai';
  isCustomEntity: boolean;
  templateTexts: {
    text: string;
    imageTag?: string | null;
    actionHint?: NotificationActionHint | null;
  }[];
  aiTexts: Array<string | AiNotificationText> | null;
  userGender: 'male' | 'female' | null;
}

/**
 * Результат выбора текста
 */
export interface PickTextResult {
  text: string;
  templateIdForSlot: 'template_text' | 'ai_generated';
  selectedAiTextIndex: number | null;
  templateIndex: number | null;
  imageTag: string | null;
  subtype: NotificationSubtype | null;
  actionHint: NotificationActionHint;
}

const DEBUG_NOTIFICATIONS = process.env.DEBUG_NOTIFICATIONS === 'true';

/**
 * Выбирает неиспользованный AI-текст из пула по индексу и хешу
 * Использует комбинированный подход для максимальной надежности
 */
function selectUnusedAiText(
  aiTexts: Array<string | AiNotificationText>,
  usedIndices: Set<number>,
  usedHashes: Set<string>,
  usedTexts: Set<string>
): {
  text: string;
  index: number;
  imageTag: string | null;
  subtype: NotificationSubtype | null;
  actionHint: NotificationActionHint;
} | null {
  // Получаем доступные индексы (не использованные по индексу)
  const availableIndices = aiTexts
    .map((_, index) => index)
    .filter((index) => !usedIndices.has(index));

  if (availableIndices.length === 0) {
    return null;
  }

  // Перемешиваем для случайного выбора, но с проверкой хеша и текста на дубликаты
  const shuffled = [...availableIndices].sort(() => Math.random() - 0.5);

  // Ищем первый доступный текст, который не был использован по хешу
  // Хеш вычисляется от исходного текста (rawText), чтобы форматирование не влияло на проверку дубликатов
  for (const index of shuffled) {
    const entry = aiTexts[index];
    const rawText = typeof entry === 'string' ? entry : entry.text;

    // Вычисляем хеш от исходного текста для проверки дубликатов
    // Это важно: форматирование не должно влиять на проверку
    const textHash = hashNotificationText(rawText);

    // Проверяем по хешу (основная защита - устойчив к форматированию)
    // И по тексту (дополнительная защита)
    if (!usedHashes.has(textHash) && !usedTexts.has(rawText)) {
      return {
        text: rawText,
        index: index,
        imageTag: typeof entry === 'string' ? null : (entry.imageTag ?? null),
        subtype: typeof entry === 'string' ? null : (entry.subtype ?? null),
        actionHint:
          typeof entry === 'string' ? 'none' : (entry.actionHint ?? 'none'),
      };
    }
  }

  // Если все доступные тексты уже использованы (дубликаты в массиве), возвращаем null
  // Это предотвратит создание слота с дубликатом
  console.warn(
    `[TextSelection] ⚠️ All available texts are duplicates (by hash or text), cannot select unique text`
  );
  return null;
}

/**
 * Фолбэк-выбор AI-текста, когда весь пул уже использован.
 * ВАЖНО: уведомления не должны прекращаться из-за исчерпания пула — пока рефилл
 * догенерирует новые тексты в фоне, переиспользуем существующий, отдавая
 * предпочтение тем, что ещё не выбраны в текущем прогоне оркестрации.
 */
function selectReusableAiText(
  aiTexts: Array<string | AiNotificationText>,
  usedTextsThisRun: Set<string>
): {
  text: string;
  index: number;
  imageTag: string | null;
  subtype: NotificationSubtype | null;
  actionHint: NotificationActionHint;
} | null {
  if (aiTexts.length === 0) {
    return null;
  }

  const notUsedThisRun = aiTexts
    .map((_, index) => index)
    .filter((index) => {
      const entry = aiTexts[index];
      const rawText = typeof entry === 'string' ? entry : entry.text;
      return !usedTextsThisRun.has(rawText);
    });

  const pool =
    notUsedThisRun.length > 0
      ? notUsedThisRun
      : aiTexts.map((_, index) => index);

  const index = pool[Math.floor(Math.random() * pool.length)];
  const entry = aiTexts[index];

  return {
    text: typeof entry === 'string' ? entry : entry.text,
    index,
    imageTag: typeof entry === 'string' ? null : (entry.imageTag ?? null),
    subtype: typeof entry === 'string' ? null : (entry.subtype ?? null),
    actionHint:
      typeof entry === 'string' ? 'none' : (entry.actionHint ?? 'none'),
  };
}

/**
 * Выбирает неиспользованный шаблонный текст
 * ВАЖНО: Если все тексты использованы, начинаем заново (циклическое использование)
 * При сбросе очищаются только шаблонные тексты из usedTexts, AI-тексты остаются
 */
function selectTemplateText(
  templateTexts: { text: string }[],
  state: TextSelectionState,
  userGender: 'male' | 'female' | null
): { text: string; index: number } | null {
  if (templateTexts.length === 0) {
    return null;
  }

  // Получаем доступные индексы (не использованные по индексу)
  const availableIndices = templateTexts
    .map((_, index) => index)
    .filter((index) => !state.usedTemplateIndices.has(index));

  // Если все тексты использованы, сбрасываем и начинаем заново
  if (availableIndices.length === 0) {
    if (DEBUG_NOTIFICATIONS) {
      console.log(
        `[TextSelection] 🔄 All ${templateTexts.length} texts used, resetting and starting over`
      );
    }
    // 1) Сбрасываем локальные структуры для шаблонов
    state.usedTemplateIndices.clear();
    state.usedTemplateHashes.clear();
    // 2) Убираем из usedTexts все raw-тексты шаблонов,
    //    чтобы дать им «вторую жизнь» в этом же цикле
    //    ВАЖНО: AI-тексты остаются в usedTexts
    for (const t of templateTexts) {
      state.usedTexts.delete(t.text);
    }
    // 3) Теперь все индексы доступны для второго круга
    const allIndices = templateTexts.map((_, index) => index);
    const randomIndex =
      allIndices[Math.floor(Math.random() * allIndices.length)];
    const selectedText = templateTexts[randomIndex];
    const rawText = selectedText.text;

    return {
      text: formatNotificationText(rawText, userGender),
      index: randomIndex,
    };
  }

  // Перемешиваем для случайного выбора, но с проверкой хеша и текста на дубликаты
  const shuffled = [...availableIndices].sort(() => Math.random() - 0.5);

  // Ищем первый доступный текст, который не был использован по хешу
  // Хеш вычисляется от исходного текста (rawText), чтобы форматирование не влияло на проверку дубликатов
  for (const index of shuffled) {
    const rawText = templateTexts[index].text;

    // Вычисляем хеш от исходного текста для проверки дубликатов
    const textHash = hashNotificationText(rawText);

    // Проверяем по хешу (основная защита - устойчив к форматированию)
    // И по тексту (дополнительная защита)
    if (
      !state.usedTemplateHashes.has(textHash) &&
      !state.usedTexts.has(rawText)
    ) {
      return {
        text: formatNotificationText(rawText, userGender),
        index: index,
      };
    }
  }

  // Если все доступные тексты уже использованы (дубликаты в массиве), возвращаем null
  // Это предотвратит создание слота с дубликатом
  console.warn(
    `[TextSelection] ⚠️ All available template texts are duplicates (by hash or text), cannot select unique text`
  );
  return null;
}

/**
 * Пытается использовать AI-текст для слота
 * Обновляет все необходимые структуры данных и возвращает true при успехе
 */
function tryUseAiText(
  aiTexts: Array<string | AiNotificationText>,
  slotIndex: number,
  state: TextSelectionState,
  userGender: 'male' | 'female' | null,
  reason: string
): PickTextResult | null {
  const selectedText = selectUnusedAiText(
    aiTexts,
    state.usedAiIndices,
    state.usedAiHashes,
    state.usedTexts
  );

  if (selectedText) {
    const text = formatNotificationText(selectedText.text, userGender);
    state.usedAiIndices.add(selectedText.index);
    const textHash = hashNotificationText(selectedText.text);
    state.usedAiHashes.add(textHash);
    state.usedTexts.add(selectedText.text);
    if (DEBUG_NOTIFICATIONS) {
      console.log(
        `[TextSelection] ✅ Using AI text (${reason}, slot ${slotIndex}): index: ${selectedText.index}, text="${text.substring(0, 50)}..."`
      );
    }
    return {
      text,
      templateIdForSlot: 'ai_generated',
      selectedAiTextIndex: selectedText.index,
      templateIndex: null,
      imageTag: selectedText.imageTag,
      subtype: selectedText.subtype ?? null,
      actionHint: selectedText.actionHint ?? 'none',
    };
  }

  // Пул AI-текстов исчерпан (все индексы уже использованы по БД-usage).
  // Чтобы доставка не вставала, переиспользуем текст. Рефилл догенерирует новые в фоне.
  const reused = selectReusableAiText(aiTexts, state.usedTexts);
  if (reused) {
    const text = formatNotificationText(reused.text, userGender);
    // В рамках текущего прогона помечаем как использованный, чтобы не дублировать в один день.
    state.usedTexts.add(reused.text);
    console.warn(
      `[TextSelection] ♻️ AI pool exhausted (${reason}), reusing text to keep notifications flowing: slot ${slotIndex}, index: ${reused.index}`
    );
    return {
      text,
      templateIdForSlot: 'ai_generated',
      selectedAiTextIndex: reused.index,
      templateIndex: null,
      imageTag: reused.imageTag,
      subtype: reused.subtype ?? null,
      actionHint: reused.actionHint ?? 'none',
    };
  }

  console.warn(
    `[TextSelection] ❌ AI pool empty, cannot select or reuse text, skipping slot: slot ${slotIndex}`
  );
  return null;
}

/**
 * Выбирает текст для слота на основе параметров и состояния
 * @param state - состояние выбора текста
 * @param params - параметры выбора
 * @returns результат выбора или null если текст не найден
 */
export function pickTextForSlot(
  state: TextSelectionState,
  params: PickTextParams
): PickTextResult | null {
  const {
    slotIndex,
    textSource,
    isCustomEntity,
    templateTexts,
    aiTexts,
    userGender,
  } = params;

  const selectedTemplateText =
    templateTexts.length > 0
      ? selectTemplateText(templateTexts, state, userGender)
      : null;
  const templateText = selectedTemplateText ? selectedTemplateText.text : null;

  if (textSource === 'ai') {
    if (aiTexts && aiTexts.length > 0) {
      return tryUseAiText(
        aiTexts,
        slotIndex,
        state,
        userGender,
        isCustomEntity ? 'AI mode (custom entity)' : 'AI mode (template entity)'
      );
    }

    console.warn(
      isCustomEntity
        ? `[TextSelection] ❌ No AI texts found for custom entity in AI mode: slot ${slotIndex}`
        : `[TextSelection] AI texts not ready yet, skipping slot (AI mode, template entity): slot ${slotIndex}`
    );
    return null;
  }

  // Режим templates: используем только шаблоны
  if (templateText && selectedTemplateText) {
    const rawText = templateTexts[selectedTemplateText.index].text;
    if (state.usedTexts.has(rawText)) {
      console.warn(
        isCustomEntity
          ? `[TextSelection] ⚠️ Template text already used, skipping slot: slot ${slotIndex}, text="${rawText.substring(0, 50)}..."`
          : `[TextSelection] ⚠️ Template text from DB already used, trying templates: slot ${slotIndex}, text="${rawText.substring(0, 50)}..."`
      );
      return null;
    }

    state.usedTexts.add(rawText);
    state.usedTemplateIndices.add(selectedTemplateText.index);
    const textHash = hashNotificationText(rawText);
    state.usedTemplateHashes.add(textHash);
    return {
      text: templateText,
      templateIdForSlot: 'template_text',
      selectedAiTextIndex: null,
      templateIndex: selectedTemplateText.index,
      imageTag: templateTexts[selectedTemplateText.index].imageTag ?? null,
      subtype: null,
      actionHint:
        templateTexts[selectedTemplateText.index].actionHint ?? 'none',
    };
  }

  if (!templateText && templateTexts.length === 0) {
    console.warn(
      isCustomEntity
        ? `[TextSelection] ❌ No template text found for custom entity: slot ${slotIndex}, templateTexts count: ${templateTexts.length}`
        : `[TextSelection] ⚠️ No texts found in DB, skipping slot: slot ${slotIndex}`
    );
    return null;
  }

  return null;
}
