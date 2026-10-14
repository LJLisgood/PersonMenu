import type { Filters, Route } from './types';
const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
export const emptyFilters: Filters = {
  q: '',
  category: '',
  source: '',
  difficulty: '',
  tag: '',
  include: '',
  exclude: '',
};
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const question = raw.indexOf('?');
  const pathname = question < 0 ? raw : raw.slice(0, question);
  const query = question < 0 ? '' : raw.slice(question + 1);
  const [page, rawId] = pathname.split('/');
  const params = new URLSearchParams(query);
  const filters = Object.fromEntries(
    Object.keys(emptyFilters).map((key) => [key, params.get(key) || '']),
  ) as Filters;
  return {
    page:
      page === 'recipe' ||
      page === 'cook' ||
      page === 'add' ||
      page === 'home' ||
      page === 'favorites' ||
      page === 'recent' ||
      page === 'account' ||
      page === 'requests' ||
      page === 'admin'
        ? page
        : 'library',
    ...(params.get('from') &&
    ['home', 'library', 'favorites', 'recent'].includes(params.get('from')!)
      ? { from: params.get('from') as Route['from'] }
      : {}),
    ...(['name', 'time', 'difficulty'].includes(params.get('sort') || '')
      ? { sort: params.get('sort') as Route['sort'] }
      : {}),
    id: rawId ? safeDecode(rawId) : undefined,
    filters,
    view: params.has('view') ? (params.get('view') === 'list' ? 'list' : 'grid') : preferredView(),
  };
}
export function routeHash(route: Route): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route.filters)) if (value) params.set(key, value);
  params.set('view', route.view);
  if (route.from) params.set('from', route.from);
  if (route.sort) params.set('sort', route.sort);
  return `#/${route.page === 'library' ? '' : route.page}${route.id ? '/' + encodeURIComponent(route.id) : ''}${params.size ? '?' + params.toString() : ''}`;
}
export const assetUrl = (value: string | null | undefined): string =>
  value
    ? value.startsWith('/api/media/')
      ? value
      : `${import.meta.env.BASE_URL}${value.replace(/^\.\//, '')}`
    : '';
export function cookRemaining(endAt: number | null, now = Date.now()) {
  return endAt === null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
}
export type CookingState = {
  step: number;
  checked: string[];
  endAt: number | null;
  timerMinutes: number;
};
export function loadCooking(id: string, count: number): CookingState {
  const fallback: CookingState = { step: 0, checked: [], endAt: null, timerMinutes: 5 };
  try {
    const parsed = JSON.parse(localStorage.getItem(`zaotai-cook:${id}`) || 'null');
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      step: Number.isInteger(parsed.step) ? Math.max(0, Math.min(count - 1, parsed.step)) : 0,
      checked: Array.isArray(parsed.checked)
        ? parsed.checked.filter((x: unknown) => typeof x === 'string')
        : [],
      endAt:
        typeof parsed.endAt === 'number' && Number.isFinite(parsed.endAt) ? parsed.endAt : null,
      timerMinutes:
        typeof parsed.timerMinutes === 'number' && parsed.timerMinutes > 0
          ? parsed.timerMinutes
          : 5,
    };
  } catch {
    return fallback;
  }
}
export function persistCooking(id: string, state: CookingState) {
  try {
    localStorage.setItem(`zaotai-cook:${id}`, JSON.stringify(state));
  } catch {
    /* Optional progress persistence cannot block cooking. */
  }
}

export function preferredView(): Route['view'] {
  try {
    return localStorage.getItem('zaotai-view:v1') === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}
export function saveView(view: Route['view']) {
  try {
    localStorage.setItem('zaotai-view:v1', view);
  } catch {
    /* URL remains authoritative. */
  }
}
export function recipeRoute(route: Route, id: string): Route {
  const from =
    route.page === 'home' || route.page === 'favorites' || route.page === 'recent'
      ? route.page
      : 'library';
  return { ...route, page: 'recipe', id, from };
}
export function returnRoute(route: Route): Route {
  return { ...route, page: route.from || 'library', id: undefined, from: undefined };
}
export function ingredientTerms(value: string) {
  return value
    .split(/[，,、\n]+/)
    .map((s) => s.normalize('NFKC').toLowerCase().trim())
    .filter(Boolean);
}
// Same local calendar date and IDs produce the same order, independent of manifest order.
export function dailyRecipes<T extends { id: string }>(recipes: T[], date: string): T[] {
  const score = (id: string) => {
    let hash = 2166136261;
    for (const character of `${date}:${id}`)
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  return [...recipes].sort((a, b) => score(a.id) - score(b.id) || a.id.localeCompare(b.id));
}
