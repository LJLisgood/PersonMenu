import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';

export const categories = {
  vegetable_dish: '素菜',
  meat_dish: '荤菜',
  aquatic: '水产',
  breakfast: '早餐',
  staple: '主食',
  soup: '汤',
  dessert: '甜品',
  drink: '饮品',
  condiment: '调味料',
  'semi-finished': '半成品',
};
const parser = unified().use(remarkParse).use(remarkGfm);
const renderer = unified().use(remarkRehype).use(rehypeSanitize).use(rehypeStringify);
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 20);
export const plain = (node) => toString(node).replace(/\s+/g, ' ').trim();
export async function walk(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch((e) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  })) {
    if (entry.isSymbolicLink()) throw new Error(`不允许内容目录中的符号链接: ${entry.name}`);
    if (entry.isDirectory()) result.push(...(await walk(path.join(dir, entry.name))));
    else if (entry.isFile()) result.push(path.join(dir, entry.name));
  }
  return result.sort();
}
export function localTarget(url, filename, contentRoot) {
  if (/^(https?:|mailto:|tel:|#)/i.test(url)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) throw new Error(`不支持的资源协议: ${url}`);
  const raw = url.split(/[?#]/)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new Error(`无法解析资源路径: ${url}`);
  }
  const target = path.resolve(path.dirname(filename), decoded);
  if (!target.startsWith(path.resolve(contentRoot) + path.sep))
    throw new Error(`资源超出内容目录: ${url}`);
  return target;
}
function collectReferences(tree) {
  const references = [];
  visit(tree, (n) => {
    if (n.type === 'image' || n.type === 'link')
      references.push({ kind: n.type, url: n.url, alt: n.alt ?? '' });
  });
  const definitions = new Map();
  visit(tree, 'definition', (n) => definitions.set(n.identifier, n.url));
  visit(tree, (n) => {
    if (n.type === 'imageReference' || n.type === 'linkReference') {
      const url = definitions.get(n.identifier);
      if (url) references.push({ kind: n.type === 'imageReference' ? 'image' : 'link', url });
    }
  });
  return references;
}

export function markdownReferences(raw) {
  return collectReferences(parser.parse(matter(raw).content));
}

export function parseRecipe(raw, relativePath, source = 'howtocook') {
  const { data, content } = matter(raw);
  const tree = parser.parse(content);
  const titleNode = tree.children.find((n) => n.type === 'heading' && n.depth === 1);
  const title =
    data.title ??
    (titleNode ? plain(titleNode).replace(/的做法$/, '') : path.basename(relativePath, '.md'));
  if (typeof title !== 'string' || !title.trim()) throw new Error(`${relativePath}: 菜名不能为空`);
  const category = source === 'howtocook' ? categories[relativePath.split('/')[1]] : data.category;
  if (typeof category !== 'string' || !category.trim())
    throw new Error(`${relativePath}: 必须填写有效分类`);
  if (source === 'personal' && (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(data.id)))
    throw new Error(`${relativePath}: id 必须是稳定的字母、数字、下划线或连字符`);
  if (
    data.tags !== undefined &&
    (!Array.isArray(data.tags) || data.tags.some((x) => typeof x !== 'string'))
  )
    throw new Error(`${relativePath}: tags 必须是字符串数组`);
  for (const key of ['totalMinutes', 'servings'])
    if (
      data[key] !== undefined &&
      (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] <= 0)
    )
      throw new Error(`${relativePath}: ${key} 必须是正数`);
  if (
    data.difficulty !== undefined &&
    (!Number.isInteger(data.difficulty) || data.difficulty < 1 || data.difficulty > 5)
  )
    throw new Error(`${relativePath}: difficulty 必须为 1 到 5`);
  if (data.description !== undefined && typeof data.description !== 'string')
    throw new Error(`${relativePath}: description 必须是文本`);
  if (data.cover !== undefined && typeof data.cover !== 'string')
    throw new Error(`${relativePath}: cover 必须是相对图片路径`);
  const sections = [];
  let current = { name: '简介', nodes: [] };
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth <= 2) {
      if (node.depth === 1) continue;
      sections.push(current);
      current = { name: plain(node), nodes: [] };
    } else current.nodes.push(node);
  }
  sections.push(current);
  const ingredientsSection = sections.find((s) => /必备原料|食材|原料和工具|材料/.test(s.name));
  const ingredients =
    ingredientsSection?.nodes
      .filter((n) => n.type === 'list')
      .flatMap((n) => n.children.map(plain)) ?? [];
  const operation = sections.find((s) => /^(操作|步骤|制作步骤|做法)/.test(s.name));
  // Continuously numbered lists can be interrupted by notes or photos in upstream Markdown.
  // Attach those nodes to the preceding step, preserving every operation node in order.
  const steps = [];
  let reliable = !!operation;
  for (const node of operation?.nodes ?? []) {
    if (node.type === 'list' && node.ordered) {
      if ((node.start ?? 1) !== steps.length + 1) {
        reliable = false;
        break;
      }
      for (const item of node.children)
        steps.push({ nodes: [...item.children], text: plain(item) });
    } else if (node.type === 'html' && /^<!--/.test(node.value.trim())) {
      continue;
    } else if (steps.length) {
      steps[steps.length - 1].nodes.push(node);
      steps[steps.length - 1].text += ' ' + plain(node);
    } else {
      reliable = false;
      break;
    }
  }
  reliable = reliable && steps.length > 0;
  if (!reliable) steps.length = 0;
  const descriptionNode = sections[0].nodes.find(
    (n) =>
      n.type === 'paragraph' &&
      !/预估|烹饪难度|卡路里/.test(plain(n)) &&
      n.children.some((child) => child.type === 'text' && child.value.trim()),
  );
  const difficultyText = content.match(/(?:预估烹饪难度|难度)[：:]\s*([★⭐]+)/);
  const references = collectReferences(tree);
  if (data.cover) references.push({ kind: 'image', url: data.cover });
  return {
    id: source === 'personal' ? data.id : `htc-${hash(relativePath)}`,
    name: title.trim(),
    category: category.trim(),
    source,
    tags: [...new Set(data.tags ?? [])],
    description: data.description ?? (descriptionNode ? plain(descriptionNode) : ''),
    difficulty: data.difficulty ?? (difficultyText ? Math.min(5, difficultyText[1].length) : null),
    totalMinutes: data.totalMinutes ?? null,
    servings: data.servings ?? null,
    ingredients,
    steps,
    reliable,
    sections,
    tree,
    references,
    cover: data.cover,
    searchBody: plain(tree),
    relativePath,
    raw,
  };
}
export async function render(nodes, rewrite) {
  const tree = structuredClone({ type: 'root', children: nodes });
  const defs = new Map();
  visit(tree, 'definition', (n) => defs.set(n.identifier, n.url));
  visit(tree, (n, index, parent) => {
    const url =
      n.type === 'imageReference' ? defs.get(n.identifier) : n.type === 'image' ? n.url : null;
    if (url && /^https?:/i.test(url) && parent && index !== undefined)
      parent.children[index] = {
        type: 'text',
        value: `[外部图片：${n.alt || '图片'}，参见来源原文]`,
      };
  });
  visit(tree, (n, index, parent) => {
    if (n.type === 'image' || n.type === 'link' || n.type === 'definition')
      n.url = rewrite(n.url, n.type);
    if (n.type === 'link' && n.url === '#missing-reference' && parent && index !== undefined) {
      parent.children[index] = { type: 'text', value: `${plain(n)}（原文引用已失效）` };
      return;
    }
    if (n.type === 'link' && /^https?:/i.test(n.url))
      n.data = { hProperties: { target: '_blank', rel: 'noopener noreferrer' } };
  });
  return String(renderer.stringify(await renderer.run(tree)));
}
