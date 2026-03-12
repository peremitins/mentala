import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryEntries } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import {
  getEntryDateKey,
  getTodayEntryDate,
  getYesterdayEntryDate,
  resolveEntryTimezone,
} from '@/server/application/gratitude-diary/entry-date';
import { GratitudeDiaryQueryDto } from '@/shared/dto';
import {
  GRATITUDE_PROMPT_CATEGORIES,
  getAllGratitudePrompts,
} from '@/shared/gratitude-diary/catalog';

interface GroupedEntries {
  title: string;
  items: Array<{
    id: number;
    text: string;
    mood: string | null;
    tags: string[];
    photoUrl: string | null;
    promptText: string | null;
    inputMethod: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

function calculateStreak(dates: string[], timezone: string): number {
  if (!dates.length) return 0;

  const unique = Array.from(new Set(dates)).sort().reverse();
  const todayIso = getTodayEntryDate(timezone);
  const yesterdayIso = getYesterdayEntryDate(timezone);
  const firstDate = unique[0];

  if (!firstDate) return 0;

  if (firstDate !== todayIso && firstDate !== yesterdayIso) {
    return 0;
  }

  let streak = 1;
  let cursor = firstDate;

  for (let i = 1; i < unique.length; i++) {
    const nextDate = unique[i];
    if (!nextDate) break;

    const prev = getPreviousEntryDate(cursor);
    if (prev !== nextDate) break;
    streak += 1;
    cursor = nextDate;
  }

  return streak;
}

function getPreviousEntryDate(dateKey: string): string {
  const [yearText = '', monthText = '', dayText = ''] = dateKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return cursor.toISOString().slice(0, 10);
}

function buildGroups(
  entries: Array<{
    id: number;
    text: string;
    mood: string | null;
    tags: string[];
    photoUrl: string | null;
    promptText: string | null;
    inputMethod: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
  timezone: string
): GroupedEntries[] {
  const groups = new Map<string, GroupedEntries>();
  const today = getTodayEntryDate(timezone);
  const yesterday = getYesterdayEntryDate(timezone);
  const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  for (const entry of entries) {
    const entryDate = getEntryDateKey(new Date(entry.createdAt), timezone);
    const title =
      entryDate === today
        ? 'Сегодня'
        : entryDate === yesterday
          ? 'Вчера'
          : dateFormatter.format(new Date(entry.createdAt));

    if (!groups.has(title)) {
      groups.set(title, { title, items: [] });
    }

    groups.get(title)?.items.push(entry);
  }

  return Array.from(groups.values());
}

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const parsed = GratitudeDiaryQueryDto.safeParse(getQuery(event));
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const { search, promptId } = parsed.data;
  const normalizedSearch = (search || '').trim().toLowerCase();
  const timezone = resolveEntryTimezone(event);

  const where = normalizedSearch
    ? and(
        eq(gratitudeDiaryEntries.userId, Number(sessionResult.user.id)),
        ilike(gratitudeDiaryEntries.text, `%${normalizedSearch}%`)
      )
    : eq(gratitudeDiaryEntries.userId, Number(sessionResult.user.id));

  const rows = await db
    .select()
    .from(gratitudeDiaryEntries)
    .where(where)
    .orderBy(desc(gratitudeDiaryEntries.createdAt));

  // Дополнительный фильтр по тегам оставляем в памяти,
  // чтобы поиск работал и по массиву tags.
  const filteredRows = normalizedSearch
    ? rows.filter(
        (row) =>
          row.tags.some((tag) =>
            tag.toLowerCase().includes(normalizedSearch)
          ) || row.text.toLowerCase().includes(normalizedSearch)
      )
    : rows;

  const allPrompts = getAllGratitudePrompts();
  const currentPrompt =
    allPrompts.find((prompt) => prompt.id === promptId) ||
    allPrompts[0] ||
    null;

  const streak = calculateStreak(
    filteredRows.map((row) =>
      getEntryDateKey(new Date(row.createdAt), timezone)
    ),
    timezone
  );

  return {
    streak,
    entriesCount: filteredRows.length,
    currentPrompt,
    groupedEntries: buildGroups(filteredRows, timezone),
    promptCategories: GRATITUDE_PROMPT_CATEGORIES,
    isEmpty: filteredRows.length === 0,
  };
});
