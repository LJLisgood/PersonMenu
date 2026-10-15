export type RecipeAiDraft = {
  name: string;
  category: string;
  description: string;
  tags: string[];
  ingredients: string;
  steps: string[];
  notes: string;
  difficulty: number | null;
  totalMinutes: number | null;
  servings: number | null;
  warnings: string[];
};

export function validateAiDraft(value: unknown, categories: string[]): RecipeAiDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('AI 返回的菜谱格式无效');
  const v = value as Record<string, unknown>;
  const str = (key: string, max: number) => {
    if (typeof v[key] !== 'string' || v[key].length > max) throw new Error('AI 返回的菜谱字段无效');
    return v[key].trim();
  };
  const list = (key: string, max: number, length: number) => {
    const items = v[key];
    if (
      !Array.isArray(items) ||
      items.length > max ||
      items.some((x) => typeof x !== 'string' || !x.trim() || x.length > length)
    )
      throw new Error('AI 返回的菜谱列表无效');
    return items.map((x: string) => x.trim());
  };
  const num = (key: string, max: number) => {
    const n = v[key];
    if (n === null) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > max)
      throw new Error('AI 返回的菜谱数值无效');
    return n;
  };
  const category = str('category', 100);
  const draft = {
    name: str('name', 100),
    category: categories.includes(category) ? category : '',
    description: str('description', 500),
    tags: list('tags', 20, 30),
    ingredients: str('ingredients', 15000),
    steps: list('steps', 80, 10000),
    notes: str('notes', 10000),
    difficulty: num('difficulty', 5),
    totalMinutes: num('totalMinutes', 10080),
    servings: num('servings', 1000),
    warnings: list('warnings', 20, 500),
  };
  if (
    !draft.ingredients ||
    !draft.steps.length ||
    draft.steps.join('').length + draft.ingredients.length + draft.notes.length > 45000
  )
    throw new Error('AI 未返回完整或长度合适的食材和步骤，请补充原文后重试');
  return draft;
}
