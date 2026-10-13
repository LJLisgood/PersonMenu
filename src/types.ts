export type Recipe = {
  id: string;
  name: string;
  category: string;
  source: 'howtocook' | 'personal';
  description: string;
  tags: string[];
  difficulty: number | null;
  totalMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  cover: string | null;
};
export type RecipeDetail = Recipe & {
  html: string;
  original: string;
  steps: { id: string; text: string; html: string }[];
  supporting: { name: string; html: string }[];
  sourcePath: string;
  sourceUrl: string | null;
};
export type Manifest = {
  schemaVersion: number;
  revision: string;
  recipes: Recipe[];
  categories: Record<string, number>;
  tags: string[];
  upstream: { commit: string; recipeCount: number };
};
export type Filters = {
  q: string;
  category: string;
  source: string;
  difficulty: string;
  tag: string;
  include: string;
  exclude: string;
};
export type Route = {
  page: 'home' | 'library' | 'favorites' | 'recent' | 'recipe' | 'cook' | 'add';
  from?: 'home' | 'library' | 'favorites' | 'recent';
  sort?: 'name' | 'time' | 'difficulty';
  id?: string;
  filters: Filters;
  view: 'grid' | 'list';
};
