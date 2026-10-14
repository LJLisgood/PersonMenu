import { beforeAll, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import type { RecipeRecord } from '../shared/cloud';
import { prepareRecipe } from '../shared/recipe';
import { buildIndex, queryRecipes } from '../scripts/search.mjs';
import { emptyFilters } from '../src/state';
let imported: { recipes: RecipeRecord[]; media: { id: string }[] };
beforeAll(async () => {
  imported = JSON.parse(await fs.readFile('.cloud/import.json', 'utf8'));
});
it('迁移保持稳定 ID、来源、嵌套原文和全部受控资源引用', () => {
  const known = new Set(imported.media.map((r) => r.id));
  expect(imported.recipes.filter((r) => r.document.source === 'howtocook')).toHaveLength(373);
  expect(imported.recipes.some((r) => r.id.includes('REPLACE-WITH-UNIQUE-ID'))).toBe(false);
  for (const row of imported.recipes) {
    expect(row.id).toBe(row.document.id);
    expect(row.original_document).toBeTruthy();
    if (row.document.source === 'howtocook') expect(row.upstream_commit).toMatch(/^[a-f\d]{40}$/);
    for (const match of JSON.stringify(row.document).matchAll(/\/api\/media\/([a-zA-Z0-9_.-]+)/g))
      expect(known.has(match[1])).toBe(true);
  }
});
it('全部导入菜谱可进入线上编辑器的同一清理和分步流程', async () => {
  for (const row of imported.recipes) {
    const edited = await prepareRecipe(
      row.document as unknown as Record<string, unknown>,
      row.id,
      row.document,
    );
    expect(edited.id).toBe(row.id);
    expect(edited.source).toBe(row.document.source);
    expect(edited.html).not.toContain('<script>');
  }
}, 30000);
it('新发布内容可用中文、拼音及食材筛选，无须服务器逐字搜索', async () => {
  const recipe = await prepareRecipe(
    {
      name: '家常番茄炒蛋',
      category: '家常菜',
      original: '## 食材\n\n- 番茄\n- 鸡蛋\n\n## 步骤\n\n1. 翻炒。',
    },
    'new-online',
  );
  const recipes = [{ ...recipe, searchBody: recipe.original }];
  const search = buildIndex(recipes);
  expect(queryRecipes(search, recipes, { ...emptyFilters, q: '番茄炒蛋' })).toEqual(['new-online']);
  expect(queryRecipes(search, recipes, { ...emptyFilters, q: 'jcfqcd' })).toEqual(['new-online']);
  expect(queryRecipes(search, recipes, { ...emptyFilters, exclude: '鸡蛋' })).toEqual([]);
});
