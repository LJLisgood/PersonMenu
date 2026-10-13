import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { walk, parseRecipe } from './content.mjs';
export const template = (name, category, id) =>
  `---\nid: ${id}\ntitle: ${JSON.stringify(name)}\ncategory: ${JSON.stringify(category)}\ntags: []\n# difficulty: 2\n# totalMinutes: 20\n# servings: 2\n# cover: ./images/cover.jpg\n---\n\n# ${name}的做法\n\n写下这道菜的特点，或者你想记住的味道。\n\n## 食材\n\n- 食材名称\n\n## 用量\n\n- 写下食材用量，保留单位与必要说明。\n\n## 步骤\n\n1. 准备食材。\n2. 写下制作步骤。\n\n## 备注\n\n- 写下火候、替代食材或注意事项。\n`;
export async function createRecipe(root, name, category = '家常菜') {
  if (!name?.trim() || name !== name.trim() || /[\x00-\x1f/\\]/.test(name) || /^\.+$/.test(name))
    throw new Error('请提供有效菜名，不能含路径分隔符或首尾空格');
  if (!category?.trim()) throw new Error('分类不能为空');
  for (const file of await walk(path.join(root, 'content/personal'))) {
    if (!file.endsWith('.md')) continue;
    const r = parseRecipe(
      await fs.readFile(file, 'utf8'),
      path.relative(path.join(root, 'content/personal'), file),
      'personal',
    );
    if (r.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      throw new Error(`个人菜谱中已存在「${name}」，未覆盖文件`);
  }
  const dir = path.join(root, 'content/personal', name);
  await fs.mkdir(dir, { recursive: false });
  await fs.mkdir(path.join(dir, 'images'));
  await fs.writeFile(
    path.join(dir, `${name}.md`),
    template(name, category, `personal-${randomUUID()}`),
    { flag: 'wx' },
  );
  return dir;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const value = (key) => args[args.indexOf(key) + 1];
  try {
    const dir = await createRecipe(
      process.cwd(),
      args.includes('--name') ? value('--name') : '',
      args.includes('--category') ? value('--category') : '家常菜',
    );
    console.log(`已创建菜谱: ${dir}\n编辑 Markdown，图片放到 images/；开发预览会自动更新。`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
