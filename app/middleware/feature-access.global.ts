import { useEntitlements } from '@/app/composables/useEntitlements';
import { useAuthStore } from '@/app/stores/auth';
import { HABITS_CATALOG } from '@/app/lib/habitsCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';

const BASIC_FREE_BREATH_SLUGS = new Set(['4-7-8', 'box-breathing']);
const CATALOG_HABIT_KEYS = new Set(
  HABITS_CATALOG.map((habit) => habit.habitKey)
);
const CATALOG_THERAPY_KEYS = new Set(THERAPY_TOPICS.map((topic) => topic.key));

function normalizeParam(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (process.server) return;

  const path = to.path;
  const isMeditationsRoute =
    path === '/meditations' || path.startsWith('/meditations/');
  const isBreathRoute =
    path === '/breath-practices' || path.startsWith('/breath-practices/');
  const isHabitsRoute = path === '/habits' || path.startsWith('/habits/');
  const isTherapyRoute = path === '/therapy' || path.startsWith('/therapy/');
  const isGratitudeDiaryRoute =
    path === '/practices/gratitude-diary' ||
    path.startsWith('/practices/gratitude-diary/');

  // Применяем guard только к маршрутам с тарифными ограничениями.
  if (
    !isMeditationsRoute &&
    !isBreathRoute &&
    !isHabitsRoute &&
    !isTherapyRoute &&
    !isGratitudeDiaryRoute
  ) {
    return;
  }

  const auth = useAuthStore();
  if (!auth.user || !auth.isLoggedIn) return;

  const { getFeatureAccess, refreshEntitlements } = useEntitlements();
  try {
    // Обновляем snapshot доступов перед проверкой маршрута.
    await refreshEntitlements();
  } catch (error) {
    console.warn(
      '[FeatureAccessMiddleware] refresh entitlements failed:',
      error
    );
  }

  if (isMeditationsRoute) {
    const meditationsAccess = getFeatureAccess('meditations.library.full');
    if (!meditationsAccess.available && path !== '/') {
      return navigateTo('/', { replace: true });
    }
    return;
  }

  if (isHabitsRoute) {
    const habitParam = normalizeParam(to.params.id);
    // /habits (без id) всегда доступен.
    if (!habitParam) return;

    // Системные привычки не закрываем по premium-фиче custom.
    if (CATALOG_HABIT_KEYS.has(habitParam)) return;

    const customHabitsAccess = getFeatureAccess('habits.custom.create');
    if (!customHabitsAccess.available && path !== '/') {
      return navigateTo('/', { replace: true });
    }
    return;
  }

  if (isTherapyRoute) {
    const therapyParam = normalizeParam(to.params.key);
    // /therapy (без key) всегда доступен.
    if (!therapyParam) return;

    // Каталогные темы терапии не закрываем по premium-фиче custom.
    if (CATALOG_THERAPY_KEYS.has(therapyParam)) return;

    const customTherapyAccess = getFeatureAccess('therapy.custom.create');
    if (!customTherapyAccess.available && path !== '/') {
      return navigateTo('/', { replace: true });
    }
    return;
  }

  if (isGratitudeDiaryRoute) {
    const gratitudeDiaryAccess = getFeatureAccess('gratitude.diary.full');
    if (!gratitudeDiaryAccess.available && path !== '/') {
      return navigateTo('/', { replace: true });
    }
    return;
  }

  const slug = normalizeParam(to.params.slug);
  // Каталог дыхания оставляем доступным: там есть free-контент и paywall-кнопки.
  if (!slug) return;

  if (slug === 'custom') {
    const customCreateAccess = getFeatureAccess('breath.custom.create');
    if (!customCreateAccess.available && path !== '/') {
      return navigateTo('/', { replace: true });
    }
    return;
  }

  if (slug.startsWith('custom-')) {
    const customManageAccess = getFeatureAccess('breath.custom.manage');
    if (!customManageAccess.available && path !== '/') {
      return navigateTo('/', { replace: true });
    }
    return;
  }

  if (BASIC_FREE_BREATH_SLUGS.has(slug)) return;

  const fullCatalogAccess = getFeatureAccess('breath.catalog.full');
  if (!fullCatalogAccess.available && path !== '/') {
    return navigateTo('/', { replace: true });
  }
});
