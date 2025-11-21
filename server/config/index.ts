export const config = {
  rateLimit: { windowMs: 60_000, max: 60 },
  llm: {
    defaultProvider: 'openai' as 'openai',
    openai: {
      // Общая модель по умолчанию (fallback)
      defaultModel: 'gpt-4o-mini',

      // Модели для разных сценариев
      models: {
        chat: 'gpt-4o', // Чат с аватаром - более мощная модель
        notifications: 'gpt-4o-mini', // Уведомления - экономичная модель
      },

      // Настройки для разных сценариев
      settings: {
        chat: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          enableReasoning: false, // опционально
        },
        notifications: {
          temperature: 0.7, // Выше для разнообразия
          maxOutputTokens: 512, // Короткие тексты
          enableReasoning: false, // Не нужно
        },
      },

      pricingUSDPerMTok: {
        // Approx pricing; adjust from OpenAI pricing page if changed
        'gpt-4o-mini': { in: 0.15, out: 0.6 },
        'gpt-4o': { in: 5.0, out: 15.0 },
        // Когда появится GPT-5:
        // 'gpt-5': { in: 10.0, out: 30.0 },
      },
      defaultMaxOutputTokens: 512,
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
