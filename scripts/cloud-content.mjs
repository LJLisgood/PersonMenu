import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildContent } from './build-content.mjs';
import { hash, localTarget, markdownReferences } from './content.mjs';

const command = process.argv[2] || 'prepare';
const root = process.cwd(),
  staging = path.join(root, '.cloud');
const mime = (filename) =>
  filename.endsWith('.webp')
    ? 'image/webp'
    : filename.endsWith('.png')
      ? 'image/png'
      : /\.jpe?g$/i.test(filename)
        ? 'image/jpeg'
        : 'text/plain; charset=utf-8';
async function prepare() {
  await buildContent(root);
  const manifest = JSON.parse(await fs.readFile('public/data/manifest.json', 'utf8'));
  const media = [];
  for (const filename of await fs.readdir('public/media')) {
    if (filename.startsWith('.')) continue;
    const file = path.join(root, 'public/media', filename),
      stat = await fs.stat(file);
    if (!stat.isFile()) continue;
    const id = `import-${hash(await fs.readFile(file))}-${filename}`;
    media.push({
      id,
      object_key: `import/${id}`,
      content_type: mime(filename),
      bytes: stat.size,
      file,
    });
  }
  const assets = new Map(media.map((item) => [path.basename(item.file), item.id]));
  const mapping = (value) =>
    value.replace(
      /(?:\.\/)?media\/([a-zA-Z0-9_.-]+)/g,
      (_match, filename) => `/api/media/${assets.get(filename) ?? 'missing'}`,
    );
  const recipeFiles = new Map();
  for (const item of manifest.recipes) {
    const detail = JSON.parse(await fs.readFile(`public/data/recipes/${item.id}.json`, 'utf8'));
    recipeFiles.set(path.resolve(root, detail.sourcePath), item.id);
  }
  const recipes = [];
  for (const summary of manifest.recipes) {
    if (summary.id.includes('REPLACE-WITH-UNIQUE-ID')) continue;
    const original = JSON.parse(
      await fs.readFile(`public/data/recipes/${summary.id}.json`, 'utf8'),
    );
    const document = JSON.parse(mapping(JSON.stringify(original)));
    // Preserve exact upstream input separately; adapt image references in the editable copy.
    const filename = path.resolve(root, original.sourcePath);
    const sourceRoot = path.resolve(root, 'content');
    for (const ref of markdownReferences(original.original)) {
      if (/^(https?:|#|mailto:|tel:)/i.test(ref.url)) continue;
      const target = localTarget(ref.url, filename, sourceRoot);
      if (!target) continue;
      if (ref.kind === 'image') {
        const key = `${hash(path.relative(sourceRoot, target))}.webp`;
        if (assets.has(key))
          document.original = document.original
            .split(ref.url)
            .join(`/api/media/${assets.get(key)}`);
      } else if (recipeFiles.has(target)) {
        document.original = document.original
          .split(ref.url)
          .join(`#/recipe/${recipeFiles.get(target)}`);
      } else {
        const key = `${hash(path.relative(sourceRoot, target))}${path.extname(target)}`;
        if (assets.has(key))
          document.original = document.original
            .split(ref.url)
            .join(`/api/media/${assets.get(key)}`);
      }
    }
    recipes.push({
      id: summary.id,
      document,
      original_document: original,
      state: 'published',
      upstream_commit: summary.source === 'howtocook' ? manifest.upstream.commit : null,
    });
  }
  await fs.mkdir(staging, { recursive: true });
  await fs.writeFile(
    path.join(staging, 'import.json'),
    JSON.stringify({ version: 1, recipes, media }, null, 2),
  );
  console.log(`已准备 ${recipes.length} 道菜谱、${media.length} 个资源。没有写入任何云端服务。`);
}
async function db(endpoint, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    base = process.env.SUPABASE_URL;
  if (!key || !base)
    throw new Error('请先在 .dev.vars 或环境变量中填写 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${endpoint}`, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: {
      apikey: key,
      ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
  });
  if (!response.ok)
    throw new Error(
      `数据库操作失败（HTTP ${response.status}），请检查迁移、权限和网络；没有输出凭证或响应正文。`,
    );
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
const wrangler = path.join(root, 'node_modules/.bin/wrangler');
async function cli(args) {
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(wrangler, args, {
          stdio: ['ignore', 'ignore', 'pipe'],
          env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
        });
        let error = '';
        child.stderr.on('data', (chunk) => {
          error += chunk;
        });
        child.on('error', () => reject(new Error('无法执行 Wrangler，请先 npm ci')));
        child.on('close', (code) =>
          code === 0
            ? resolve()
            : reject(
                Object.assign(
                  new Error(
                    'R2 操作失败，请检查网络、wrangler login、桶名称和权限。凭证不会写入报告。',
                  ),
                  {
                    retryable: /fetch failed|ECONN|ETIMEDOUT|UND_ERR|429|timeout|timed out/i.test(
                      error,
                    ),
                  },
                ),
              ),
        );
      });
      return;
    } catch (error) {
      if (!error.retryable || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
}
async function apply() {
  if (!process.argv.includes('--apply'))
    throw new Error('实际导入需要显式添加 --apply；仅准备数据使用 npm run cloud:prepare');
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error('请填写有效的 R2_BUCKET_NAME');
  const data = JSON.parse(await fs.readFile(path.join(staging, 'import.json'), 'utf8'));
  const concurrency = Number(
    process.argv.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1] ?? 4,
  );
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error('--concurrency 必须为 1 到 8 的整数');
  const existingRecipes = new Map();
  const existingUploads = new Set();
  for (const [endpoint, collect] of [
    ['recipes?select=id,upstream_commit', (row) => existingRecipes.set(row.id, row)],
    ['uploads?select=id', (row) => existingUploads.add(row.id)],
  ]) {
    for (let offset = 0; ; offset += 1000) {
      const rows = await db(`${endpoint}&order=id&limit=1000&offset=${offset}`);
      rows.forEach(collect);
      if (rows.length < 1000) break;
    }
  }
  // Upload resources before their database metadata or recipes become visible.
  let next = 0,
    completed = 0,
    failed;
  const upload = async (i) => {
    const item = data.media[i];
    if (existingUploads.has(item.id) && !process.argv.includes('--repair-media')) return;
    await cli([
      'r2',
      'object',
      'put',
      `${bucket}/${item.object_key}`,
      '--file',
      item.file,
      '--content-type',
      item.content_type,
      '--remote',
      '--force',
    ]);
    const { file, ...row } = item;
    await db('uploads?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  };
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (!failed && next < data.media.length) {
        const i = next++;
        try {
          await upload(i);
          completed++;
          if (completed % 25 === 0 || completed === data.media.length)
            console.log(`资源进度 ${completed}/${data.media.length}`);
        } catch (error) {
          failed = error;
        }
      }
    }),
  );
  if (failed) throw failed;
  let inserted = 0,
    skipped = 0;
  const conflicts = [];
  const additions = [];
  for (const row of data.recipes) {
    const existing = existingRecipes.get(row.id);
    if (existing) {
      skipped++;
      if (existing.upstream_commit !== row.upstream_commit) conflicts.push(row.id);
      continue;
    }
    additions.push(row);
  }
  for (let offset = 0; offset < additions.length; offset += 10) {
    const batch = additions.slice(offset, offset + 10);
    // The unique ID and ignore-duplicates also protect an import racing an online edit.
    const result = await db('recipes?on_conflict=id&select=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(batch),
    });
    inserted += result.length;
    skipped += batch.length - result.length;
  }
  await fs.writeFile(
    path.join(staging, 'import-report.json'),
    JSON.stringify({ inserted, skipped, upstreamNeedsReview: conflicts }, null, 2),
  );
  console.log(
    `导入完成：新增 ${inserted}，保留已有 ${skipped}。上游差异 ${conflicts.length} 条，详见 .cloud/import-report.json；已有线上内容从不自动覆盖。`,
  );
}
async function exportContent() {
  const destination = path.join(
    staging,
    `export-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
  await fs.mkdir(destination, { recursive: true });
  const recipes = [],
    uploads = [];
  for (let offset = 0; ; offset += 100) {
    const rows = await db(`recipes?order=id&limit=100&offset=${offset}`);
    recipes.push(...rows);
    if (rows.length < 100) break;
  }
  for (let offset = 0; ; offset += 100) {
    const rows = await db(`uploads?order=id&limit=100&offset=${offset}`);
    uploads.push(...rows);
    if (rows.length < 100) break;
  }
  await fs.writeFile(path.join(destination, 'recipes.json'), JSON.stringify(recipes, null, 2));
  await fs.writeFile(path.join(destination, 'uploads.json'), JSON.stringify(uploads, null, 2));
  await fs.mkdir(path.join(destination, 'markdown'), { recursive: true });
  const exportedNames = new Map(
    uploads.map((u) => [
      u.id,
      /\.(webp|png|jpg|jpeg|md|txt)$/i.test(u.id)
        ? u.id
        : `${u.id}${u.content_type === 'image/webp' ? '.webp' : u.content_type === 'image/png' ? '.png' : u.content_type === 'image/jpeg' ? '.jpg' : '.txt'}`,
    ]),
  );
  for (const row of recipes) {
    if (!/^[a-zA-Z0-9_-]+$/.test(row.id)) throw new Error('无效菜谱编号');
    const d = row.document;
    const rebase = (value) =>
      process.argv.includes('--media')
        ? value.replace(
            /\/api\/media\/([a-zA-Z0-9_.-]+)/g,
            (_match, id) => `../media/${exportedNames.get(id) ?? id}`,
          )
        : value;
    const fields = {
      id: d.id,
      title: d.name,
      category: d.category,
      description: d.description,
      tags: d.tags,
      ...(d.difficulty !== null ? { difficulty: d.difficulty } : {}),
      ...(d.totalMinutes !== null ? { totalMinutes: d.totalMinutes } : {}),
      ...(d.servings !== null ? { servings: d.servings } : {}),
      ...(d.cover ? { cover: rebase(d.cover) } : {}),
    };
    const front = Object.entries(fields)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
    const markdown = rebase(d.original.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''));
    await fs.writeFile(
      path.join(destination, 'markdown', `${row.id}.md`),
      `---\n${front}\n---\n\n${markdown}`,
    );
  }
  if (process.argv.includes('--media')) {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error('导出图片需要 R2_BUCKET_NAME');
    await fs.mkdir(path.join(destination, 'media'), { recursive: true });
    for (const upload of uploads) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(upload.id)) throw new Error('无效资源编号');
      await cli([
        'r2',
        'object',
        'get',
        `${bucket}/${upload.object_key}`,
        '--file',
        path.join(destination, 'media', exportedNames.get(upload.id)),
        '--remote',
      ]);
    }
  }
  console.log(
    `已导出 ${recipes.length} 道菜谱及资源清单至 ${path.relative(root, destination)}${process.argv.includes('--media') ? '，包含图片' : '；包含草稿，请妥善保管。追加 --media 可下载 R2 资源'}。`,
  );
}
try {
  if (command === 'prepare') await prepare();
  else if (command === 'import') await apply();
  else if (command === 'export') await exportContent();
  else throw new Error('支持 prepare、import、export');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
