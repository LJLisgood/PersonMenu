import MiniSearch from 'minisearch';
import { searchOptions, queryRecipes } from '../scripts/search.mjs';
import type { Filters, Recipe } from './types';
let search: MiniSearch | null = null;
let recipes: Recipe[] = [];
self.onmessage = async (
  event: MessageEvent<{
    type: string;
    index?: string;
    recipes?: Recipe[];
    filters?: Filters;
    requestId: number;
  }>,
) => {
  const { type, requestId } = event.data;
  try {
    if (type === 'init') {
      recipes = event.data.recipes!;
      search = MiniSearch.loadJSON(event.data.index!, searchOptions);
      self.postMessage({ type: 'ready' });
    } else if (search) {
      const start = performance.now();
      const ids = queryRecipes(search, recipes, event.data.filters!);
      self.postMessage({ type: 'results', requestId, ids, duration: performance.now() - start });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
