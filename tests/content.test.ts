import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseRecipe, render, localTarget, walk } from '../scripts/content.mjs';
import { createRecipe } from '../scripts/new-recipe.mjs';
import { buildContent } from '../scripts/build-content.mjs';
const sample = `---\nid: test-1\ntitle: 鸡蛋汤\ncategory: 汤\ntags: [快手]\n---\n# 鸡蛋汤的做法\n\n暖暖的一碗。\n\n## 食材\n\n- 鸡蛋\n- 葱\n\n## 用量\n\n- 鸡蛋 = 1 个 * 份数\n\n## 步骤\n\n1. 搅匀。\n   - 不要打发。\n2. 下锅。\n\n## 备注\n\n- 小火。\n`;
describe('Markdown content', () => {
  it('preserves nested instructions, formulas, and optional metadata', async () => {
    const r = parseRecipe(sample, '鸡蛋汤.md', 'personal');
    expect(r.ingredients).toEqual(['鸡蛋', '葱']);
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0].text).toContain('不要打发');
    expect(r.totalMinutes).toBeNull();
    expect(r.difficulty).toBeNull();
    expect(await render(r.tree.children, (s: string) => s)).toContain('1 个 * 份数');
  });
  it('splits consecutive ordered lists interrupted by notes and preserves all nodes', () => {
    const r = parseRecipe(
      '# 菜的做法\n\n## 操作\n\n1. 洗菜\n2. 去皮\n\n- 开水烫皮\n\n3. 炒菜\n\n![成品](./a.jpg)\n',
      'dishes/vegetable_dish/菜.md',
    );
    expect(r.steps).toHaveLength(3);
    expect(r.steps[1].text).toContain('开水烫皮');
    expect(r.steps[2].nodes).toHaveLength(2);
  });
  it('falls back for ambiguous numbering or narrative before steps', () => {
    expect(
      parseRecipe('# 菜\n\n## 操作\n\n准备完成后开始。\n\n1. 洗菜\n', 'dishes/vegetable_dish/菜.md')
        .reliable,
    ).toBe(false);
    expect(
      parseRecipe(
        '# 菜\n\n## 操作\n\n1. 洗菜\n\n- 提示\n\n1. 新做法\n',
        'dishes/vegetable_dish/菜.md',
      ).reliable,
    ).toBe(false);
  });
  it('rejects invalid metadata and path escapes', () => {
    expect(() =>
      parseRecipe(sample.replace('tags: [快手]', 'tags: 快手'), 'a.md', 'personal'),
    ).toThrow('tags');
    expect(() =>
      parseRecipe(
        sample.replace('category: 汤', 'category: 汤\ntotalMinutes: -2'),
        'a.md',
        'personal',
      ),
    ).toThrow('totalMinutes');
    expect(() =>
      localTarget('../../../secret', '/site/content/personal/a.md', '/site/content'),
    ).toThrow('超出');
    expect(() =>
      localTarget('javascript:alert(1)', '/site/content/personal/a.md', '/site/content'),
    ).toThrow('协议');
  });
  it('does not execute raw HTML, event handlers, scripts, or external image requests', async () => {
    const r = parseRecipe(
      sample +
        '\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[bad](javascript:alert(1))\n\n![remote](https://example.com/photo.jpg)\n',
      'a.md',
      'personal',
    );
    const html = await render(r.tree.children, (s: string) => s);
    expect(html).not.toMatch(/<script|onerror|javascript:|src="https/);
    expect(html).toContain('外部图片');
  });
});
describe('personal files and full import', () => {
  it('creates a stable template and refuses duplicate names without overwriting', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recipe-test-'));
    try {
      await fs.mkdir(path.join(root, 'content/personal'), { recursive: true });
      const dir = await createRecipe(root, '测试菜', '自定义');
      const file = path.join(dir, '测试菜.md');
      const before = await fs.readFile(file, 'utf8');
      const r = parseRecipe(before, '测试菜/测试菜.md', 'personal');
      expect(r.id).toMatch(/^personal-/);
      expect(r.category).toBe('自定义');
      expect(r.steps).toHaveLength(2);
      await expect(createRecipe(root, '测试菜')).rejects.toThrow('已存在');
      expect(await fs.readFile(file, 'utf8')).toBe(before);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it('includes every actual upstream recipe and reports preexisting broken references', async () => {
    const report = await buildContent(process.cwd(), { validate: true });
    const files = await walk('content/howtocook/dishes');
    const lock = JSON.parse(await fs.readFile('content/howtocook/upstream.json', 'utf8'));
    expect(report.upstreamCount).toBe(lock.recipeCount);
    expect(
      files.filter((f: string) => f.endsWith('.md') && !f.includes('/template/')),
    ).toHaveLength(lock.recipeCount);
    if (lock.commit === '3dfa950f6daf0a5b311fc46619f1b559bac980c4')
      expect(report.upstreamCount).toBe(373);
    expect(report.errors).toEqual([]);
    expect(report.missingResources.every((x: { kind: string }) => x.kind === 'link')).toBe(true);
  });
  it('rejects duplicate IDs and missing personal resources during validation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recipe-validation-'));
    try {
      await fs.mkdir(path.join(root, 'content/howtocook'), { recursive: true });
      await fs.mkdir(path.join(root, 'content/personal'), { recursive: true });
      await fs.writeFile(path.join(root, 'content/howtocook/upstream.json'), '{"recipeCount":0}');
      await fs.writeFile(path.join(root, 'content/personal/a.md'), sample);
      await fs.writeFile(path.join(root, 'content/personal/b.md'), sample);
      await expect(buildContent(root, { validate: true })).rejects.toThrow('重复 id');
      await fs.unlink(path.join(root, 'content/personal/b.md'));
      await fs.writeFile(
        path.join(root, 'content/personal/a.md'),
        sample + '\n![照片](./missing.jpg)',
      );
      await expect(buildContent(root, { validate: true })).rejects.toThrow('缺失本地资源');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
