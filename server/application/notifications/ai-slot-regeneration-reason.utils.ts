// Причины, при которых после генерации AI-текстов нужно пересчитать расписание.
// Это только пользовательские/бизнес-события, где пересчёт ожидаем и явный.
const AI_REASONS_REQUIRING_SLOT_REGEN = new Set<string>([
  'manual',
  'prefs_create',
  'prefs_update',
  'prefs_changed',
  'settings_preferences_update',
  'settings_preferences_create',
  'onboarding_complete',
  'user_gender_update',
  'login',
  'timezone_changed',
]);

export function shouldRegenerateSlotsAfterAiGeneration(
  reason?: string | null
): boolean {
  if (!reason) return false;
  return AI_REASONS_REQUIRING_SLOT_REGEN.has(reason);
}

export function resolveSlotsRegenerationReasonFromAiReason(
  reason?: string | null
): 'manual' | 'prefs_changed' | 'login' | 'timezone_changed' {
  if (reason === 'login') return 'login';
  if (reason === 'timezone_changed') return 'timezone_changed';
  if (reason === 'manual') return 'manual';
  return 'prefs_changed';
}
