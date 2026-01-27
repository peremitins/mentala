import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { db } from '../infrastructure/db/client';
import { sessionSummaries } from '../infrastructure/db/schema';
import { eq, desc } from 'drizzle-orm';

// Упрощаем хранение: сохраняем summary как plaintext в summary_ct без шифрования.
const RAW_KEY = null as unknown as Buffer;
const ENCRYPT_DISABLED = true;

function encrypt(plaintext: string): { iv: string; ct: string } {
  const key = RAW_KEY && RAW_KEY.length === 32 ? RAW_KEY : randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: Buffer.concat([iv, tag]).toString('base64'),
    ct: ct.toString('base64'),
  };
}

function decrypt(ivAndTagB64: string, ctB64: string): string {
  const key = RAW_KEY && RAW_KEY.length === 32 ? RAW_KEY : null;
  if (!key) throw new Error('No stable SUMMARY_AES_KEY set');
  const buf = Buffer.from(ivAndTagB64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

export const summaryStore = {
  async save(userId: string, sessionId: string, summaryJson: string) {
    // dev/DEBUG: allow plaintext storage
    await db.insert(sessionSummaries).values({
      userId: String(userId),
      sessionId,
      model: 'openai',
      summaryIv: '',
      summaryCt: summaryJson,
    });
  },
  async loadAllForUser(userId: string): Promise<string[]> {
    const rows = await db
      .select()
      .from(sessionSummaries)
      .where(eq(sessionSummaries.userId, String(userId)));
    const results: string[] = [];
    for (const r of rows) {
      const s = String(r.summaryCt ?? '');
      results.push(s);
    }
    return results;
  },
  /**
   * Возвращает последние summary пользователя, отсортированные по created_at DESC.
   * Если limit не указан — возвращает все.
   */
  async getSummaries(
    userId: number | string,
    limit?: number
  ): Promise<Array<Record<string, any>>> {
    let rows: any[];
    if (typeof limit === 'number') {
      rows = (await db
        .select()
        .from(sessionSummaries)
        .where(eq(sessionSummaries.userId, String(userId)))
        .orderBy(desc(sessionSummaries.createdAt))
        .limit(limit as any)) as any[];
    } else {
      rows = (await db
        .select()
        .from(sessionSummaries)
        .where(eq(sessionSummaries.userId, String(userId)))
        .orderBy(desc(sessionSummaries.createdAt))) as any[];
    }

    const out: Array<Record<string, any>> = [];
    for (const r of rows as any[]) {
      try {
        const jsonStr = String(r.summaryCt ?? '');
        const obj = JSON.parse(String(jsonStr || '{}')) as Record<string, any>;
        out.push(obj);
      } catch {}
    }
    return out;
  },
  /** Возвращает количество сохраненных summary для пользователя */
  async countByUser(userId: number | string): Promise<number> {
    const rows = await db
      .select({ id: sessionSummaries.id })
      .from(sessionSummaries)
      .where(eq(sessionSummaries.userId, String(userId)));
    return Array.isArray(rows) ? rows.length : 0;
  },
  // getAllParsed больше не нужен — используйте getSummaries(userId) без limit
};
