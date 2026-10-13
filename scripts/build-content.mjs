import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { walk, parseRecipe, localTarget, hash, render } from './content.mjs';
import { buildIndex } from './search.mjs';

export async function buildContent(root, { validate = false } = {}) {
  const contentRoot = path.join(root, 'content');
  const allFiles = await walk(contentRoot);
  const markdown = allFiles.filter(
    (f) =>
      f.endsWith('.md') &&
      (/\/personal\//.test(f) || (/\/howtocook\/dishes\//.test(f) && !/\/template\//.test(f))),
  );
  const parsed = [];
  const known = new Map();
  const errors = [];
  for (const filename of markdown) {
    const source = filename.includes('/personal/') ? 'personal' : 'howtocook';
    const sourceRoot = path.join(contentRoot, source);
    try {
      const recipe = parseRecipe(
        await fs.readFile(filename, 'utf8'),
        path.relative(sourceRoot, filename).split(path.sep).join('/'),
        source,
      );
      if (known.has(recipe.id))
        throw new Error(`重复 id ${recipe.id}: ${known.get(recipe.id).relativePath}`);
      recipe.filename = filename;
      known.set(recipe.id, recipe);
      parsed.push(recipe);
    } catch (e) {
      errors.push(e.message);
    }
  }
  const lock = JSON.parse(
    await fs.readFile(path.join(contentRoot, 'howtocook/upstream.json'), 'utf8'),
  );
  const upstreamCount = parsed.filter((r) => r.source === 'howtocook').length;
  if (lock.recipeCount !== upstreamCount)
    errors.push(`上游数量不一致: 记录 ${lock.recipeCount}，解析 ${upstreamCount}`);
  const byFile = new Map(parsed.map((r) => [r.filename, r]));
  const fileSet = new Set(allFiles);
  const report = {
    version: 1,
    upstream: lock,
    count: parsed.length,
    upstreamCount,
    personalCount: parsed.length - upstreamCount,
    fallbackRecipes: [],
    missingResources: [],
    externalReferences: [],
    errors,
  };
  const media = new Map();
  const rawAssets = new Map();
  for (const recipe of parsed) {
    if (!recipe.reliable)
      report.fallbackRecipes.push({
        id: recipe.id,
        path: recipe.relativePath,
        reason: '操作章节未找到可完整拆分的独立有序列表，保留原文烹饪阅读',
      });
    for (const ref of recipe.references) {
      if (/^https?:/i.test(ref.url)) {
        report.externalReferences.push({ path: recipe.relativePath, ...ref });
        continue;
      }
      if (/^(#|mailto:|tel:)/i.test(ref.url)) continue;
      let target;
      try {
        target = localTarget(ref.url, recipe.filename, contentRoot);
      } catch (e) {
        errors.push(`${recipe.relativePath}: ${e.message}`);
        continue;
      }
      if (!fileSet.has(target)) {
        report.missingResources.push({ path: recipe.relativePath, ...ref });
        if (recipe.source === 'personal')
          errors.push(`${recipe.relativePath}: 缺失本地资源 ${ref.url}`);
        continue;
      }
      if (ref.kind === 'image') {
        if (!/\.(png|jpe?g|webp|gif|avif|tiff?)$/i.test(target)) {
          errors.push(`${recipe.relativePath}: 不支持的图片格式 ${ref.url}`);
          continue;
        }
        media.set(target, {
          detail: `media/${hash(path.relative(contentRoot, target))}.webp`,
          thumb: `media/${hash(path.relative(contentRoot, target))}-thumb.webp`,
        });
      } else if (!byFile.has(target))
        rawAssets.set(
          target,
          `media/${hash(path.relative(contentRoot, target))}${path.extname(target)}`,
        );
    }
  }
  if (errors.length) throw new Error(`内容验证失败:\n${errors.join('\n')}`);
  if (validate) return report;
  const output = path.join(root, 'public');
  const dataDir = path.join(output, 'data');
  const mediaDir = path.join(output, 'media');
  await fs.mkdir(path.join(dataDir, 'recipes'), { recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });
  const list = [];
  for (const recipe of parsed) {
    const rewrite = (url, kind) => {
      if (/^https?:/i.test(url)) return kind === 'image' ? '' : url; // Remote imagery is optional; reading is self-contained.
      if (/^(#|mailto:|tel:)/i.test(url)) return url;
      const target = localTarget(url, recipe.filename, contentRoot);
      if (!fileSet.has(target)) return '#missing-reference';
      if (byFile.has(target)) return `#/recipe/${byFile.get(target).id}`;
      const asset = media.get(target)?.detail ?? rawAssets.get(target);
      return asset
        ? `./${asset}${url.includes('#') ? '#' + url.split('#')[1] : ''}`
        : '#missing-reference';
    };
    let cover;
    const preferred = recipe.cover ? localTarget(recipe.cover, recipe.filename, contentRoot) : null;
    if (preferred) cover = media.get(preferred);
    if (!cover)
      for (const ref of recipe.references
        .filter((r) => r.kind === 'image')
        .sort((a, b) => {
          const rank = (ref) =>
            /成品|完成|出锅/.test(ref.alt)
              ? 3
              : path.basename(ref.url, path.extname(ref.url)) === recipe.name
                ? 2
                : 0;
          return rank(b) - rank(a) || recipe.references.indexOf(b) - recipe.references.indexOf(a);
        })) {
        const target = localTarget(ref.url, recipe.filename, contentRoot);
        if (target && media.has(target)) {
          cover = media.get(target);
          break;
        }
      }
    const {
      id,
      name,
      category,
      source,
      description,
      tags,
      difficulty,
      totalMinutes,
      servings,
      ingredients,
    } = recipe;
    const summary = {
      id,
      name,
      category,
      source,
      description,
      tags,
      difficulty,
      totalMinutes,
      servings,
      ingredients,
      cover: cover?.thumb ?? null,
    };
    list.push(summary);
    const details = {
      ...summary,
      cover: cover?.detail ?? null,
      original: recipe.raw,
      html: await render(recipe.tree.children, rewrite),
      steps: await Promise.all(
        recipe.steps.map(async (s, i) => ({
          id: `${id}-${i}`,
          text: s.text,
          html: await render(s.nodes, rewrite),
        })),
      ),
      supporting: await Promise.all(
        recipe.sections
          .filter((s) => s.name !== '简介' && !/^(操作|步骤|制作步骤|做法)/.test(s.name))
          .map(async (s) => ({ name: s.name, html: await render(s.nodes, rewrite) })),
      ),
      sourcePath:
        recipe.source === 'personal'
          ? `content/personal/${recipe.relativePath}`
          : `content/howtocook/${recipe.relativePath}`,
      sourceUrl:
        recipe.source === 'howtocook'
          ? `https://github.com/Anduin2017/HowToCook/blob/${lock.commit}/${recipe.relativePath.split('/').map(encodeURIComponent).join('/')}`
          : null,
    };
    await fs.writeFile(path.join(dataDir, 'recipes', `${id}.json`), JSON.stringify(details));
  }
  // Incremental image conversion: content hashes preserve unchanged images on rebuild.
  const cacheFile = path.join(mediaDir, '.cache.json');
  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8').catch(() => '{}'));
  for (const [target, destination] of media) {
    const input = await fs.readFile(target);
    const digest = hash(input);
    if (
      cache[destination.detail] === digest &&
      (await fs.stat(path.join(output, destination.thumb)).catch(() => false))
    )
      continue;
    await sharp(input)
      .rotate()
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(output, destination.detail));
    await sharp(input)
      .rotate()
      .resize(640, 420, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(path.join(output, destination.thumb));
    cache[destination.detail] = digest;
  }
  const activeMedia = new Set(
    [...media.values()]
      .flatMap((m) => [path.basename(m.detail), path.basename(m.thumb)])
      .concat([...rawAssets.values()].map((p) => path.basename(p))),
  );
  for (const file of await fs.readdir(mediaDir))
    if (file !== '.cache.json' && !activeMedia.has(file))
      await fs.unlink(path.join(mediaDir, file));
  for (const key of Object.keys(cache)) if (!activeMedia.has(path.basename(key))) delete cache[key];
  await fs.writeFile(cacheFile, JSON.stringify(cache));
  for (const [target, destination] of rawAssets)
    await fs.copyFile(target, path.join(output, destination));
  const featured = ['宫保鸡丁', '清蒸鲈鱼', '地三鲜', '凉拌木耳', '白灼虾', '南瓜粥'];
  list.sort((a, b) => {
    const rank = (r) => {
      const index = featured.indexOf(r.name);
      return index >= 0 ? index : r.cover ? 20 : 30;
    };
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'zh-CN');
  });
  const categoryCounts = Object.fromEntries(
    [...new Set(list.map((r) => r.category))].map((c) => [
      c,
      list.filter((r) => r.category === c).length,
    ]),
  );
  const index = JSON.stringify(buildIndex(parsed));
  const manifest = {
    schemaVersion: 1,
    revision: hash(JSON.stringify(list) + index),
    recipes: list,
    categories: categoryCounts,
    tags: [...new Set(list.flatMap((r) => r.tags))].sort(),
    upstream: lock,
  };
  report.indexBytes = Buffer.byteLength(index);
  report.localImages = media.size;
  const activeRecipes = new Set(list.map((r) => `${r.id}.json`));
  for (const file of await fs.readdir(path.join(dataDir, 'recipes')))
    if (!activeRecipes.has(file)) await fs.unlink(path.join(dataDir, 'recipes', file));
  await fs.writeFile(path.join(dataDir, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(dataDir, 'search.json'), index);
  await fs.writeFile(path.join(dataDir, 'import-report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(
    path.join(dataDir, 'LICENSE-HowToCook.txt'),
    await fs.readFile(path.join(contentRoot, 'howtocook/LICENSE')),
  );
  return report;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const report = await buildContent(process.cwd(), {
      validate: process.argv.includes('--validate'),
    });
    console.log(
      `内容验证通过：${report.upstreamCount} 篇上游 + ${report.personalCount} 篇个人菜谱；${report.fallbackRecipes.length} 篇采用原文烹饪阅读；${report.missingResources.length} 个上游缺失引用。${report.indexBytes ? ` 搜索索引 ${(report.indexBytes / 1024 / 1024).toFixed(2)} MB` : ''}`,
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
