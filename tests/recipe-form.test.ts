import { expect, it } from 'vitest';
import { recipeFormMarkdown, readRecipeForm, recipeTags } from '../src/recipeForm';
import { prepareRecipe } from '../shared/recipe';

it('分项食材、连续编号步骤、换行备注和照片可进入正式菜谱解析，并可无损重开表单', async () => {
  const content = {
    ingredients: '番茄 2 个\n鸡蛋 3 个\n盐 适量',
    steps: Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 步\n注意火候。`),
    notes: '少放盐。\n按实际口味调整。',
    photos: ['/api/media/owned-photo.webp'],
  };
  const original = recipeFormMarkdown(content);
  expect(readRecipeForm(original)).toEqual(content);
  const recipe = await prepareRecipe({ name: '番茄炒蛋', category: '荤菜', original }, 'recipe');
  expect(recipe.ingredients).toEqual(['番茄 2 个', '鸡蛋 3 个', '盐 适量']);
  expect(recipe.steps).toHaveLength(12);
  expect(recipe.steps[9].text).toContain('第 10 步');
  expect(recipe.steps[9].html).toContain('<br>');
  expect(recipe.supporting.find((s) => s.name === '小贴士')?.html).toContain('按实际口味调整');
  expect(recipe.html).toContain('src="/api/media/owned-photo.webp"');
  expect(recipe.servings).toBeNull();
});
it('普通输入中的符号、链接写法与 HTML 按文字保留，不变成图片、脚本或额外分区', async () => {
  const content = {
    ingredients: '鱼 <300g>\n盐 & 胡椒',
    steps: ['# 标题\n1. 示例\n![远程图](https://evil.test/a.png)\n<script>alert(1)</script>\nA\\B'],
    notes: '标题\n===\n*注意*',
    photos: [],
  };
  const original = recipeFormMarkdown(content);
  expect(readRecipeForm(original)).toEqual(content);
  const recipe = await prepareRecipe({ name: '菜', category: '素菜', original }, 'safe');
  expect(recipe.steps).toHaveLength(1);
  expect(recipe.steps[0].text).toContain('<script>alert(1)</script>');
  expect(recipe.html).not.toContain('<script>');
  expect(recipe.html).not.toContain('<img');
  expect(recipe.ingredients).toEqual(['鱼 <300g>', '盐 & 胡椒']);
});
it('未知原文、frontmatter、公式和修改过的生成格式保持原文编辑，不能静默丢弃内容', () => {
  const generated = recipeFormMarkdown({
    ingredients: '盐 适量',
    steps: ['翻炒。'],
    notes: '',
    photos: [],
  });
  for (const original of [
    '---\nname: 菜\n---\n## 食材\n- 盐\n## 步骤\n1. 翻炒\n  - 提醒\n$$a=b$$',
    '## 操作\n炒熟即可。',
    `${generated}\n\n## 额外计算\n公式`,
    generated.replace('1. ', '3. '),
  ])
    expect(readRecipeForm(original)).toBeNull();
});
it('标签去重并接受中英文分隔符，超限不能绕过服务器的约束', () => {
  expect(recipeTags(['少油', '家常菜'], '少油、 快手菜，清淡')).toEqual([
    '少油',
    '家常菜',
    '快手菜',
    '清淡',
  ]);
  expect(() =>
    recipeTags(
      Array.from({ length: 20 }, (_, i) => `标签${i}`),
      '第21个',
    ),
  ).toThrow('最多 20');
  expect(() => recipeTags([], '长'.repeat(41))).toThrow('最多 40');
});
