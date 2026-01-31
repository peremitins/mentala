export const config = {
  rateLimit: { windowMs: 60_000, max: 60 },
  llm: {
    defaultProvider: 'openai' as 'openai',
    openai: {
      // Общая модель по умолчанию (fallback)
      defaultModel: 'gpt-4o-mini',

      // Модели для разных сценариев
      models: {
        chat: 'gpt-4o-mini', // Чат - более мощная модель
        notifications: 'gpt-4o-mini', // Уведомления - экономичная модель
        chips: 'gpt-4o-mini', // Чипы - экономичная модель
      },

      // Настройки для разных сценариев
      settings: {
        chat: {
          temperature: 0.3,
          maxOutputTokens: 1024, // Уменьшено с 2048 для оптимизации токенов (≈2-3 абзаца)
          enableReasoning: false, // опционально
        },
        notifications: {
          temperature: 0.7, // Выше для разнообразия
          // maxOutputTokens не используется напрямую - вычисляется динамически: count * 250 + 5000
          // Значение ниже - минимальный fallback, рассчитывается на основе AI_NOTIFICATIONS_DEFAULT_COUNT
          maxOutputTokens: (() => {
            const defaultCount =
              Number(
                process.env.NUXT_AI_NOTIFICATIONS_DEFAULT_COUNT ||
                  process.env.AI_NOTIFICATIONS_DEFAULT_COUNT
              ) || 50;
            // Рассчитываем минимальное значение на основе дефолтного количества: count * 250 + 5000
            // Увеличено с 200 до 250 токенов на текст для генерации более длинных текстов (близко к 178 символам)
            return defaultCount * 250 + 5000; // Для 50 текстов = 17500 токенов
          })(),
          enableReasoning: false, // Не нужно для простых уведомлений (увеличивает стоимость и время)
        },
        chips: {
          temperature: 0.7, // Нужна вариативность формулировок
          maxOutputTokens: 200,
          enableReasoning: false,
        },
      },

      pricingUSDPerMTok: {
        // Approx pricing; adjust from OpenAI pricing page if changed
        'gpt-4o-mini': { in: 0.15, out: 0.6 },
        'gpt-4o': { in: 5.0, out: 15.0 },
        // Когда появится GPT-5:
        // 'gpt-5': { in: 10.0, out: 30.0 },
      },
      defaultMaxOutputTokens: 800, // Уменьшено с 512 для лучшего баланса между качеством и стоимостью
    },
    limits: {
      maxRequestUSD: Number(
        process.env.NUXT_BUDGET_REQ_USD || process.env.BUDGET_REQ_USD || 0.02
      ),
      dailyUSD: Number(
        process.env.NUXT_BUDGET_DAILY_USD || process.env.BUDGET_DAILY_USD || 0.5
      ),
    },
  },
};
