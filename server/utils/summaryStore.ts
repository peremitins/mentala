import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { db } from '../infrastructure/db/client';
import { sessionSummaries } from '../infrastructure/db/schema';
import { eq } from 'drizzle-orm';

const RAW_KEY = Buffer.from(process.env.SUMMARY_AES_KEY || '', 'base64');
const ENCRYPT_DISABLED =
  (process.env.SUMMARY_ENCRYPTION_DISABLED ??
    (process.env.NODE_ENV !== 'production' ? 'true' : 'false')) === 'true';
if (!RAW_KEY || RAW_KEY.length !== 32) {
  console.warn(
    '[summaryStore] WARNING: SUMMARY_AES_KEY not set or invalid length. Generating ephemeral key for dev.'
  );
}

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
    if (ENCRYPT_DISABLED) {
      await db.insert(sessionSummaries).values({
        userId: String(userId),
        sessionId,
        model: 'openai',
        summaryIv: '',
        summaryCt: summaryJson,
      });
      return;
    }
    const { iv, ct } = encrypt(summaryJson);
    await db.insert(sessionSummaries).values({
      userId: String(userId),
      sessionId,
      model: 'openai',
      summaryIv: iv,
      summaryCt: ct,
    });
  },
  async loadAllForUser(userId: string): Promise<string[]> {
    const rows = await db
      .select()
      .from(sessionSummaries)
      .where(eq(sessionSummaries.userId, String(userId)));
    const results: string[] = [];
    for (const r of rows) {
      try {
        if (ENCRYPT_DISABLED) {
          results.push(r.summaryCt);
        } else {
          results.push(decrypt(r.summaryIv, r.summaryCt));
        }
      } catch {}
    }
    return results;
  },
};
