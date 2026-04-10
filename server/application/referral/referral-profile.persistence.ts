type Nullable<T> = T | null;

export async function ensureGeneratedRecord<TInsert, TRow>(params: {
  attempts?: number;
  findExisting: () => Promise<Nullable<TRow>>;
  buildInsertValue: () => Promise<TInsert>;
  insertValue: (value: TInsert) => Promise<Nullable<TRow>>;
  exhaustedMessage: string;
}) {
  const attempts = Math.max(1, params.attempts ?? 10);
  const existing = await params.findExisting();

  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await params.buildInsertValue();
    const inserted = await params.insertValue(value);

    if (inserted) {
      return inserted;
    }

    // Если insert тихо проиграл из-за unique conflict, читаем возможную запись,
    // которую успел создать параллельный запрос с тем же userId.
    const raced = await params.findExisting();

    if (raced) {
      return raced;
    }
  }

  throw new Error(params.exhaustedMessage);
}
