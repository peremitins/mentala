// Общий контракт durable memory:
// - лимиты по числу элементов знает модель и соблюдает merge persisted-profile;
// - char-budget 1000 применяется только к prompt-проекции, а не к storage-payload в БД.
export const DURABLE_MEMORY_PROMPT_BUDGET_MAX_CHARS = 1000;
export const DURABLE_MEMORY_PROMPT_NAME_MAX_CHARS = 40;
export const DURABLE_MEMORY_PROMPT_ITEM_MAX_CHARS = 80;
export const DURABLE_MEMORY_PROMPT_MAX_FACTS = 3;
export const DURABLE_MEMORY_PROMPT_MAX_PREFERENCES = 3;
export const DURABLE_MEMORY_PROMPT_MAX_CONTEXT = 2;
