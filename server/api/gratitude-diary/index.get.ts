import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import {
  gratitudeDiaryEntries,
  userPreferences,
} from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import {
  getEntryDateKey,
  getTodayEntryDate,
  getYesterdayEntryDate,
  resolveEntryTimezone,
} from '@/server/application/gratitude-diary/entry-date';
import { GratitudeDiaryQueryDto } from '@/shared/dto';
import {
  getAllGratitudePrompts,
  getGratitudePromptCategories,
} from '@/shared/gratitude-diary/catalog';
import { resolveAddressing } from '@/shared/utils/addressing';

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

  await assertGratitudeDiaryAccess({
    userId: Number(sessionResult.user.id),
    roleId: sessionResult.user.roleId,
  });

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
  const userId = Number(sessionResult.user.id);
  const userPrefs = await db
    .select({ addressing: userPreferences.addressing })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  const addressing = resolveAddressing(userPrefs[0]?.addressing);

  const where = normalizedSearch
    ? and(
        eq(gratitudeDiaryEntries.userId, userId),
        ilike(gratitudeDiaryEntries.text, `%${normalizedSearch}%`)
      )
    : eq(gratitudeDiaryEntries.userId, userId);

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

  const allPrompts = getAllGratitudePrompts(addressing);
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
    promptCategories: getGratitudePromptCategories(addressing),
    isEmpty: filteredRows.length === 0,
  };
});
