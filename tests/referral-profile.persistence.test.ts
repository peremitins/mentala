import { describe, expect, it, vi } from 'vitest';
import { ensureGeneratedRecord } from '../server/application/referral/referral-profile.persistence';

describe('ensureGeneratedRecord', () => {
  it('возвращает запись, которую успел создать параллельный запрос', async () => {
    const existing = {
      userId: 118,
      code: 'MENTALARHTWP8',
    };

    const findExisting = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const buildInsertValue = vi.fn().mockResolvedValue({
      userId: 118,
      code: 'MENTALARHTWP8',
    });
    const insertValue = vi.fn().mockResolvedValue(null);

    const result = await ensureGeneratedRecord({
      findExisting,
      buildInsertValue,
      insertValue,
      exhaustedMessage: 'unexpected',
    });

    expect(result).toEqual(existing);
    expect(findExisting).toHaveBeenCalledTimes(2);
    expect(buildInsertValue).toHaveBeenCalledTimes(1);
    expect(insertValue).toHaveBeenCalledTimes(1);
  });

  it('перегенерирует значение, если первый insert тихо проиграл из-за чужого unique conflict', async () => {
    const created = {
      userId: 118,
      code: 'MENTALASAFE42',
    };

    const findExisting = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const buildInsertValue = vi
      .fn()
      .mockResolvedValueOnce({
        userId: 118,
        code: 'MENTALARHTWP8',
      })
      .mockResolvedValueOnce({
        userId: 118,
        code: 'MENTALASAFE42',
      });
    const insertValue = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);

    const result = await ensureGeneratedRecord({
      findExisting,
      buildInsertValue,
      insertValue,
      exhaustedMessage: 'unexpected',
    });

    expect(result).toEqual(created);
    expect(findExisting).toHaveBeenCalledTimes(2);
    expect(buildInsertValue).toHaveBeenCalledTimes(2);
    expect(insertValue).toHaveBeenCalledTimes(2);
  });

  it('бросает понятную ошибку после исчерпания попыток', async () => {
    const findExisting = vi.fn().mockResolvedValue(null);
    const buildInsertValue = vi.fn().mockResolvedValue({
      userId: 118,
      code: 'MENTALAFAIL01',
    });
    const insertValue = vi.fn().mockResolvedValue(null);

    await expect(
      ensureGeneratedRecord({
        attempts: 2,
        findExisting,
        buildInsertValue,
        insertValue,
        exhaustedMessage: 'Не удалось сгенерировать referral code',
      })
    ).rejects.toThrow('Не удалось сгенерировать referral code');

    expect(findExisting).toHaveBeenCalledTimes(3);
    expect(buildInsertValue).toHaveBeenCalledTimes(2);
    expect(insertValue).toHaveBeenCalledTimes(2);
  });
});
