import { it, expect } from 'vitest';
import { emptyFilters, parseRoute, routeHash, cookRemaining } from './state';
it('round-trips query, combined filters, view, and detail route', () => {
  const route = {
    page: 'recipe' as const,
    id: 'htc-123',
    view: 'list' as const,
    filters: {
      ...emptyFilters,
      q: '鸡蛋',
      include: '鸡蛋, 西红柿',
      exclude: '牛奶',
      category: '素菜',
      difficulty: '2',
      tag: '快手',
    },
  };
  expect(parseRoute(routeHash(route))).toEqual(route);
});
it('defaults empty or unknown paths to the recipe library', () => {
  expect(parseRoute('').page).toBe('library');
  expect(parseRoute('#/unknown').page).toBe('library');
});
it('corrects a timer by absolute end time after returning from background', () => {
  expect(cookRemaining(120_000, 30_000)).toBe(90);
  expect(cookRemaining(120_000, 119_001)).toBe(1);
  expect(cookRemaining(120_000, 180_000)).toBe(0);
  expect(cookRemaining(null, 0)).toBe(0);
});
