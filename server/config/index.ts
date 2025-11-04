export const config = {
  rateLimit: { windowMs: 60_000, max: 60 },
  llm: {
    defaultProvider: 'openai' as 'openai',
    openai: {
      defaultModel: 'gpt-4o-mini',
      pricingUSDPerMTok: {
        // Approx pricing; adjust from OpenAI pricing page if changed
        'gpt-4o-mini': { in: 0.15, out: 0.6 },
        'gpt-4o': { in: 5.0, out: 15.0 },
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
