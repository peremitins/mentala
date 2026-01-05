const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function formatMinutesToTime(minutes: number): string {
  const clamped = Number.isFinite(minutes) ? minutes : 0;
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatActiveDays(days: number[]): string {
  if (!Array.isArray(days) || days.length === 0) {
    return '—';
  }
  const normalized = [...days]
    .map((day) => Number.isFinite(day) ? day : null)
    .filter((day): day is number => day !== null)
    .sort((a, b) => a - b);

  const labels = normalized
    .map((day) => WEEKDAY_LABELS[day % 7] ?? '')
    .filter((label) => label);

  return labels.length > 0 ? labels.join(', ') : '—';
}
