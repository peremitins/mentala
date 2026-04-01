import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  selectLimit,
  selectOrderBy,
  selectWhere,
  selectFrom,
  deleteReturning,
  deleteWhere,
  dbSelect,
  dbDelete,
} = vi.hoisted(() => {
  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn(() => ({
    limit: selectLimit,
  }));
  const selectWhere = vi.fn(() => ({
    orderBy: selectOrderBy,
  }));
  const selectFrom = vi.fn(() => ({
    where: selectWhere,
  }));
  const deleteReturning = vi.fn();
  const deleteWhere = vi.fn(() => ({
    returning: deleteReturning,
  }));
  const dbSelect = vi.fn(() => ({
    from: selectFrom,
  }));
  const dbDelete = vi.fn(() => ({
    where: deleteWhere,
  }));

  return {
    selectLimit,
    selectOrderBy,
    selectWhere,
    selectFrom,
    deleteReturning,
    deleteWhere,
    dbSelect,
    dbDelete,
  };
});

vi.mock('@/server/infrastructure/db/client', () => ({
  db: {
    select: dbSelect,
    delete: dbDelete,
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => 'and'),
  asc: vi.fn(() => 'asc'),
  inArray: vi.fn(() => 'inArray'),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  })),
}));

vi.mock('@/server/infrastructure/db/schema', () => ({
  telegramAlertDeliveries: {
    id: { name: 'id' },
    status: { name: 'status' },
    sentAt: { name: 'sent_at' },
    updatedAt: { name: 'updated_at' },
    createdAt: { name: 'created_at' },
  },
}));

import { cleanupTelegramAlertDeliveries } from '../server/application/telegram/telegram-deliveries-cleanup.service';

describe('cleanupTelegramAlertDeliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('удаляет только найденный batch устаревших terminal delivery records', async () => {
    selectLimit.mockResolvedValueOnce([{ id: 11 }, { id: 12 }]);
    deleteReturning.mockResolvedValueOnce([{ id: 11 }, { id: 12 }]);

    const result = await cleanupTelegramAlertDeliveries({
      retentionDays: 45,
      batchSize: 500,
    });

    expect(dbSelect).toHaveBeenCalledOnce();
    expect(selectFrom).toHaveBeenCalledOnce();
    expect(selectWhere).toHaveBeenCalledOnce();
    expect(selectOrderBy).toHaveBeenCalledOnce();
    expect(selectLimit).toHaveBeenCalledWith(500);
    expect(dbDelete).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(deleteReturning).toHaveBeenCalledOnce();
    expect(result).toEqual({
      cleaned: 2,
      retentionDays: 45,
      batchSize: 500,
    });
  });

  it('ничего не удаляет, если устаревших terminal delivery records нет', async () => {
    selectLimit.mockResolvedValueOnce([]);

    const result = await cleanupTelegramAlertDeliveries();

    expect(dbDelete).not.toHaveBeenCalled();
    expect(result).toEqual({
      cleaned: 0,
      retentionDays: 30,
      batchSize: 1000,
    });
  });
});
