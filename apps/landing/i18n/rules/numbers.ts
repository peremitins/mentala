// Нормализуем входное значение для правил множественного числа:
// переводим в целое число и убираем знак, чтобы формы считались стабильно.
export function normalizePluralChoice(choice: number): number {
  if (!Number.isFinite(choice)) return 0;
  return Math.abs(Math.trunc(choice));
}
