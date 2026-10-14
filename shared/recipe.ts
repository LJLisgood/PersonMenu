import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Root, RootContent } from 'mdast';
import type { RecipeDetail } from '../src/types';

const parser = unified().use(remarkParse).use(remarkGfm);
const renderer = unified().use(remarkRehype).use(rehypeSanitize).use(rehypeStringify);
export function text(value: unknown, label: string, max = 200, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error(`${label}格式不正确（最多 ${max} 字）`);
  return value.trim();
}
export function imagePath(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const path = text(value, '图片地址', 180);
  if (!/^\/api\/media\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(path))
    throw new Error('只能引用本站上传的图片');
  return path;
}
export async function renderMarkdown(nodes: RootContent[]): Promise<string> {
  const tree: Root = structuredClone({ type: 'root', children: nodes });
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node) => {
    definitions.set(node.identifier, node.url);
  });
  visit(tree, 'imageReference', (node, index, parent) => {
    const url = definitions.get(node.identifier);
    if (parent && index !== undefined && url)
      parent.children[index] = { type: 'image', alt: node.alt, url };
  });
  visit(tree, (node, index, parent) => {
    if (node.type === 'image' && /^https?:\/\//i.test(node.url) && parent && index !== undefined) {
      parent.children[index] = {
        type: 'text',
        value: `[外部图片：${node.alt || '图片'}，参见来源原文]`,
      };
      return;
    }
    if (node.type === 'image' || node.type === 'definition') {
      if (node.type === 'image') node.url = imagePath(node.url) ?? '';
      else if (!/^(https?:\/\/|#|\/api\/media\/)/i.test(node.url)) node.url = '#';
    }
    if (node.type === 'link') {
      if (!/^(https?:\/\/|#|\/api\/media\/)/i.test(node.url)) node.url = '#';
      if (/^https?:/i.test(node.url))
        node.data = { hProperties: { target: '_blank', rel: ['noopener', 'noreferrer'] } };
    }
  });
  return String(renderer.stringify(await renderer.run(tree)));
}
export async function prepareRecipe(
  input: Record<string, unknown>,
  id: string,
  existing?: RecipeDetail,
): Promise<RecipeDetail> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('菜谱格式不正确');
  const original = text(input.original, '做法正文', 50000);
  // Imported frontmatter is retained for export but form fields remain authoritative.
  const body = original.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const tree = parser.parse(body);
  const sections: { name: string; nodes: RootContent[] }[] = [{ name: '简介', nodes: [] }];
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth <= 2) {
      if (node.depth === 2) sections.push({ name: toString(node), nodes: [] });
    } else sections.at(-1)!.nodes.push(node);
  }
  const operation = sections.find((s) => /^(操作|步骤|制作步骤|做法)/.test(s.name));
  const parts: RootContent[][] = [];
  let reliable = !!operation;
  for (const node of operation?.nodes ?? []) {
    if (node.type === 'list' && node.ordered) {
      if ((node.start ?? 1) !== parts.length + 1) {
        reliable = false;
        break;
      }
      for (const item of node.children) parts.push(item.children as RootContent[]);
    } else if (node.type === 'html' && /^<!--/.test(node.value.trim())) continue;
    else if (parts.length) parts.at(-1)!.push(node);
    else {
      reliable = false;
      break;
    }
  }
  if (!reliable) parts.length = 0;
  const optional = (value: unknown, label: string, max: number, integer = false) => {
    if (value === null || value === undefined || value === '') return null;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      throw new Error(`${label}不正确`);
    return value;
  };
  const tags = input.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 20) throw new Error('标签最多 20 个');
  const ingredients =
    sections
      .find((s) => /必备原料|食材|原料和工具|材料/.test(s.name))
      ?.nodes.filter((n) => n.type === 'list')
      .flatMap((n) => (n.type === 'list' ? n.children.map((item) => toString(item)) : [])) ?? [];
  return {
    id,
    name: text(input.name, '菜名', 100),
    category: text(input.category, '分类', 40),
    source: existing?.source ?? 'personal',
    description: text(input.description ?? '', '简介', 500, false),
    tags: [...new Set(tags.map((t) => text(t, '标签', 40)))],
    difficulty: optional(input.difficulty, '难度', 5, true),
    totalMinutes: optional(input.totalMinutes, '耗时', 100000),
    servings: optional(input.servings, '份数', 10000),
    ingredients,
    cover: imagePath(input.cover),
    original,
    html: await renderMarkdown(tree.children),
    steps: await Promise.all(
      parts.map(async (nodes, i) => ({
        id: `${id}-${i}`,
        text: toString({ type: 'root', children: nodes }),
        html: await renderMarkdown(nodes),
      })),
    ),
    supporting: await Promise.all(
      sections
        .filter((s) => s.name !== '简介' && !/^(操作|步骤|制作步骤|做法)/.test(s.name))
        .map(async (s) => ({ name: s.name, html: await renderMarkdown(s.nodes) })),
    ),
    sourcePath: existing?.sourcePath ?? '',
    sourceUrl: existing?.sourceUrl ?? null,
  };
}
