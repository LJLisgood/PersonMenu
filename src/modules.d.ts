declare module '*.mjs' {
  import type MiniSearch from 'minisearch';
  import type { Filters, Recipe } from './types';
  export const searchOptions: ConstructorParameters<typeof MiniSearch>[0];
  export function queryRecipes(search: MiniSearch, recipes: Recipe[], filters: Filters): string[];
}
