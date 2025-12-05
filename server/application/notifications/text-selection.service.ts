/**
 * Сервис для выбора текста уведомлений
 * Инкапсулирует логику выбора между шаблонными и AI-текстами
 */

import { hashNotificationText } from './ai-generation.service';
import { formatNotificationTextWithName } from '@/shared/utils/notificationText';

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
  textSource: 'templates' | 'ai' | 'hybrid';
  isCustomEntity: boolean;
  templateTexts: { id: string; text: string }[];
  aiTexts: string[] | null;
  userName: string | null;
}

/**
 * Результат выбора текста
 */
export interface PickTextResult {
  text: string;
  templateIdForSlot: 'template_text' | 'ai_generated';
  selectedAiTextIndex: number | null;
  templateIndex: number | null;
}

const DEBUG_NOTIFICATIONS = process.env.DEBUG_NOTIFICATIONS === 'true';

/**
 * Выбирает неиспользованный AI-текст из пула по индексу и хешу
 * Использует комбинированный подход для максимальной надежности
 */
function selectUnusedAiText(
  aiTexts: string[],
  usedIndices: Set<number>,
  usedHashes: Set<string>,
  usedTexts: Set<string>
): { text: string; index: number } | null {
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
  // Хеш вычисляется от исходного текста (rawText), чтобы имя пользователя не влияло на проверку дубликатов
  for (const index of shuffled) {
    const rawText = aiTexts[index];

    // Вычисляем хеш от исходного текста для проверки дубликатов
    // Это важно: имя пользователя - переменная часть, не должна влиять на проверку
    const textHash = hashNotificationText(rawText);

    // Проверяем по хешу (основная защита - устойчив к форматированию)
    // И по тексту (дополнительная защита)
    if (!usedHashes.has(textHash) && !usedTexts.has(rawText)) {
      return {
        text: rawText,
        index: index,
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
 * Выбирает неиспользованный шаблонный текст
 * ВАЖНО: Если все тексты использованы, начинаем заново (циклическое использование)
 * При сбросе очищаются только шаблонные тексты из usedTexts, AI-тексты остаются
 */
function selectTemplateText(
  templateTexts: { id: string; text: string }[],
  state: TextSelectionState,
  userName: string | null
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
      text: formatNotificationTextWithName(rawText, userName),
      index: randomIndex,
    };
  }

  // Перемешиваем для случайного выбора, но с проверкой хеша и текста на дубликаты
  const shuffled = [...availableIndices].sort(() => Math.random() - 0.5);

  // Ищем первый доступный текст, который не был использован по хешу
  // Хеш вычисляется от исходного текста (rawText), чтобы имя пользователя не влияло на проверку дубликатов
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
        text: formatNotificationTextWithName(rawText, userName),
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
  aiTexts: string[],
  slotIndex: number,
  state: TextSelectionState,
  userName: string | null,
  reason: string
): PickTextResult | null {
  const selectedText = selectUnusedAiText(
    aiTexts,
    state.usedAiIndices,
    state.usedAiHashes,
    state.usedTexts
  );

  if (selectedText) {
    const text = formatNotificationTextWithName(selectedText.text, userName);
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
    };
  } else {
    console.warn(
      `[TextSelection] ❌ All AI texts already used, skipping slot: slot ${slotIndex}`
    );
    return null;
  }
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
    userName,
  } = params;

  // Выбираем templateText (если доступен)
  const selectedTemplateText =
    templateTexts.length > 0
      ? selectTemplateText(templateTexts, state, userName)
      : null;
  const templateText = selectedTemplateText ? selectedTemplateText.text : null;

  // Логика выбора текста с учетом режима генерации
  // Для кастомных сущностей (привычки и терапия)
  if (isCustomEntity) {
    // Приоритет: AI > Hybrid > Templates
    // Если textSource не определен, используем templates по умолчанию

    if (textSource === 'ai') {
      // Режим AI - используем только AI-тексты, игнорируем templateTexts
      if (aiTexts && aiTexts.length > 0) {
        const result = tryUseAiText(
          aiTexts,
          slotIndex,
          state,
          userName,
          'AI mode (custom entity)'
        );
        if (result) {
          return result;
        }
        // Если не удалось выбрать AI-текст, возвращаем null
        return null;
      } else {
        console.warn(
          `[TextSelection] ❌ No AI texts found for custom entity in AI mode: slot ${slotIndex}`
        );
        return null;
      }
    } else if (textSource === 'hybrid') {
      // Гибридный режим - чередуем templateTexts и AI детерминированно
      // Проверяем наличие обоих источников
      const hasTemplateTexts = templateText !== null;
      const hasAiTexts = aiTexts && aiTexts.length > 0;

      if (DEBUG_NOTIFICATIONS) {
        console.log(
          `[TextSelection] 🔍 HYBRID MODE - Slot ${slotIndex}: hasTemplateTexts=${hasTemplateTexts}, hasAiTexts=${hasAiTexts}, aiTexts=${aiTexts ? `[${aiTexts.length} texts]` : 'null'}, templateText=${templateText ? `"${templateText.substring(0, 30)}..."` : 'null'}`
        );
      }

      if (!hasTemplateTexts && !hasAiTexts) {
        // Если нет ни templateTexts, ни AI-текстов - пропускаем
        console.warn(
          `[TextSelection] ❌ No texts available in hybrid mode: slot ${slotIndex}`
        );
        return null;
      }

      // Детерминированное чередование: четные слоты - AI, нечетные - templateTexts
      // Если одного из источников нет, используем только доступный
      if (!hasTemplateTexts && aiTexts) {
        // Только AI-тексты
        return tryUseAiText(
          aiTexts,
          slotIndex,
          state,
          userName,
          'hybrid mode, no templateTexts'
        );
      } else if (!hasAiTexts) {
        // Только templateTexts
        if (selectedTemplateText) {
          const rawText = templateTexts[selectedTemplateText.index].text;
          if (state.usedTexts.has(rawText)) {
            console.warn(
              `[TextSelection] ⚠️ Template text already used, skipping slot: slot ${slotIndex}, text="${rawText.substring(0, 50)}..."`
            );
            return null;
          }
        }

        if (templateText && selectedTemplateText) {
          const rawText = templateTexts[selectedTemplateText.index].text;
          state.usedTexts.add(rawText);
          state.usedTemplateIndices.add(selectedTemplateText.index);
          // УНИФИЦИРОВАННАЯ ЛОГИКА: добавляем хеш для анти-дублирования
          const textHash = hashNotificationText(rawText);
          state.usedTemplateHashes.add(textHash);
        }
        return {
          text: templateText!,
          templateIdForSlot: 'template_text',
          selectedAiTextIndex: null,
          templateIndex: selectedTemplateText?.index ?? null,
        };
      } else if (aiTexts) {
        // Оба источника доступны - чередуем детерминированно
        const isEvenSlot = slotIndex % 2 === 0;
        if (DEBUG_NOTIFICATIONS) {
          console.log(
            `[TextSelection] 🔍 HYBRID MODE - Slot ${slotIndex}: isEvenSlot=${isEvenSlot}, will use ${isEvenSlot ? 'AI' : 'templateText'}`
          );
        }

        if (isEvenSlot) {
          // Четные слоты - AI
          return tryUseAiText(
            aiTexts,
            slotIndex,
            state,
            userName,
            'hybrid mode, even slot'
          );
        } else {
          // Нечетные слоты - templateTexts
          if (selectedTemplateText) {
            const rawText = templateTexts[selectedTemplateText.index].text;
            if (state.usedTexts.has(rawText)) {
              console.warn(
                `[TextSelection] ⚠️ Template text already used, skipping slot: slot ${slotIndex}, text="${rawText.substring(0, 50)}..."`
              );
              return null;
            }
          }

          if (templateText && selectedTemplateText) {
            const rawText = templateTexts[selectedTemplateText.index].text;
            state.usedTexts.add(rawText);
            state.usedTemplateIndices.add(selectedTemplateText.index);
            // УНИФИЦИРОВАННАЯ ЛОГИКА: добавляем хеш для анти-дублирования
            const textHash = hashNotificationText(rawText);
            state.usedTemplateHashes.add(textHash);
          }
          return {
            text: templateText!,
            templateIdForSlot: 'template_text',
            selectedAiTextIndex: null,
            templateIndex: selectedTemplateText?.index ?? null,
          };
        }
      } else {
        console.error(
          `[TextSelection] ❌ ERROR: Both sources should be available but aiTexts is null! slot ${slotIndex}, hasTemplateTexts=${hasTemplateTexts}, hasAiTexts=${hasAiTexts}`
        );
        return null;
      }
    } else {
      // Режим templates или undefined - используем только templateTexts
      if (templateText && selectedTemplateText) {
        // ВАЖНО: Проверяем использованные тексты (raw), чтобы избежать дублирования
        const rawText = templateTexts[selectedTemplateText.index].text;
        if (state.usedTexts.has(rawText)) {
          console.warn(
            `[TextSelection] ⚠️ Template text already used, skipping slot: slot ${slotIndex}, text="${rawText.substring(0, 50)}..."`
          );
          return null;
        }

        state.usedTexts.add(rawText);
        state.usedTemplateIndices.add(selectedTemplateText.index);
        // УНИФИЦИРОВАННАЯ ЛОГИКА: добавляем хеш для анти-дублирования
        const textHash = hashNotificationText(rawText);
        state.usedTemplateHashes.add(textHash);
        return {
          text: templateText,
          templateIdForSlot: 'template_text',
          selectedAiTextIndex: null,
          templateIndex: selectedTemplateText.index,
        };
      } else {
        console.warn(
          `[TextSelection] ❌ No template text found for custom entity: slot ${slotIndex}, templateTexts count: ${templateTexts.length}`
        );
        return null;
      }
    }
  }
  // Для готовых шаблонов (привычки и терапия)
  else {
    // ВАЖНО: Приоритет текстов из БД над шаблонами
    // Сначала используем тексты из БД (templateTexts), только если их нет - используем шаблоны

    // Если textSource не определен, используем шаблоны по умолчанию (обратная совместимость)
    const useTemplates =
      !textSource ||
      textSource === 'templates' ||
      textSource === 'hybrid';
    const useAi = textSource === 'ai' || textSource === 'hybrid';

    // Приоритет: если textSource === 'ai', используем только AI
    // Если textSource === 'hybrid', чередуем тексты из БД/шаблоны и AI
    // Если textSource === 'templates' или undefined, используем тексты из БД (если есть), иначе шаблоны

    if (textSource === 'ai') {
      // Режим AI - используем только AI-тексты
      if (aiTexts && aiTexts.length > 0) {
        return tryUseAiText(
          aiTexts,
          slotIndex,
          state,
          userName,
          'AI mode (template entity)'
        );
      } else {
        console.warn(
          `[TextSelection] AI texts not ready yet, skipping slot (AI mode, template entity): slot ${slotIndex}`
        );
        return null;
      }
    } else if (textSource === 'hybrid') {
      // Гибридный режим - чередуем шаблоны и AI детерминированно
      const hasAiTexts = aiTexts && aiTexts.length > 0;
      const isEvenSlot = slotIndex % 2 === 0;

      if (DEBUG_NOTIFICATIONS) {
        console.log(
          `[TextSelection] 🔍 HYBRID MODE (template) - Slot ${slotIndex}: hasAiTexts=${hasAiTexts}, aiTexts=${aiTexts ? `[${aiTexts.length} texts]` : 'null'}, isEvenSlot=${isEvenSlot}`
        );
      }

      // Детерминированное чередование: четные слоты - AI, нечетные - шаблоны
      // Если шаблонов нет, используем AI для всех слотов
      if (isEvenSlot && hasAiTexts && aiTexts) {
        // Четные слоты - AI
        return tryUseAiText(
          aiTexts,
          slotIndex,
          state,
          userName,
          'hybrid mode, even slot'
        );
      } else {
        // Нечетные слоты - сначала пробуем тексты из БД, потом шаблоны, если нет - используем AI
        if (templateText && selectedTemplateText) {
          // Проверяем использованные тексты (raw), чтобы избежать дублирования
          const rawText = templateTexts[selectedTemplateText.index].text;
          if (state.usedTexts.has(rawText)) {
            console.warn(
              `[TextSelection] ⚠️ Template text from DB already used, trying templates: slot ${slotIndex}, text="${rawText.substring(0, 50)}..."`
            );
          } else {
            state.usedTexts.add(rawText);
            state.usedTemplateIndices.add(selectedTemplateText.index);
            // УНИФИЦИРОВАННАЯ ЛОГИКА: добавляем хеш для анти-дублирования
            const textHash = hashNotificationText(rawText);
            state.usedTemplateHashes.add(textHash);
            return {
              text: templateText,
              templateIdForSlot: 'template_text',
              selectedAiTextIndex: null,
              templateIndex: selectedTemplateText.index,
            };
          }
        }

        // Если текста из БД нет И нет текстов в templateTexts - пропускаем слот
        // Все тексты должны быть в БД, fallback на код удален
        if (!templateText && templateTexts.length === 0) {
          // Если есть AI-тексты в hybrid режиме, используем их
          if (hasAiTexts && aiTexts) {
            if (DEBUG_NOTIFICATIONS) {
              console.log(
                `[TextSelection] 🔍 No template texts found, using AI text instead (hybrid mode, slot ${slotIndex})`
              );
            }
            return tryUseAiText(
              aiTexts,
              slotIndex,
              state,
              userName,
              'hybrid mode, no template texts'
            );
          } else {
            // Если нет ни текстов из БД, ни AI-текстов - пропускаем слот
            console.warn(
              `[TextSelection] ⚠️ No texts found in DB and no AI texts, skipping slot: slot ${slotIndex}`
            );
            return null;
          }
        }

        // Если текста нет, но templateTexts есть - это не должно произойти, но на всякий случай
        return null;
      }
    } else {
      // Режим templates или undefined - сначала пробуем тексты из БД, потом шаблоны
      if (templateText && selectedTemplateText) {
        // Проверяем использованные тексты (raw), чтобы избежать дублирования
        const rawText = templateTexts[selectedTemplateText.index].text;
        if (state.usedTexts.has(rawText)) {
          console.warn(
            `[TextSelection] ⚠️ Template text from DB already used, trying templates: slot ${slotIndex}, text="${rawText.substring(0, 50)}..."`
          );
          return null;
        } else {
          state.usedTexts.add(rawText);
          state.usedTemplateIndices.add(selectedTemplateText.index);
          const textHash = hashNotificationText(rawText);
          state.usedTemplateHashes.add(textHash);
          return {
            text: templateText,
            templateIdForSlot: 'template_text',
            selectedAiTextIndex: null,
            templateIndex: selectedTemplateText.index,
          };
        }
      }

      // Если текста из БД нет И нет текстов в templateTexts - пропускаем слот
      // Все тексты должны быть в БД, fallback на код удален
      if (!templateText && templateTexts.length === 0) {
        console.warn(
          `[TextSelection] ⚠️ No texts found in DB, skipping slot: slot ${slotIndex}`
        );
        return null;
      }

      return null;
    }
  }
}

