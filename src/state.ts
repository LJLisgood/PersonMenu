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
    page: page === 'recipe' || page === 'cook' || page === 'add' ? page : 'library',
    id: rawId ? safeDecode(rawId) : undefined,
    filters,
    view: params.get('view') === 'list' ? 'list' : 'grid',
  };
}
export function routeHash(route: Route): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route.filters)) if (value) params.set(key, value);
  if (route.view === 'list') params.set('view', 'list');
  return `#/${route.page === 'library' ? '' : route.page}${route.id ? '/' + encodeURIComponent(route.id) : ''}${params.size ? '?' + params.toString() : ''}`;
}
export const assetUrl = (value: string | null | undefined): string =>
  value ? `${import.meta.env.BASE_URL}${value.replace(/^\.\//, '')}` : '';
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
