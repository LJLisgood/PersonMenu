import fs from 'node:fs/promises';
await fs.copyFile('public/data/LICENSE-HowToCook.txt', 'dist/LICENSE-HowToCook.txt');
await fs.copyFile('LICENSE', 'dist/LICENSE-MIT.txt');
// Cloudflare serves all published content through the API. Do not ship a second,
// stale publicly addressable copy of the local source snapshot in cloud builds.
for (const directory of ['dist/data', 'dist/media'])
  await fs.rm(directory, { recursive: true, force: true });
await fs.access('dist/_routes.json');
console.log('云端构建完成：仅 /api/* 调用 Worker API，本地菜谱数据未复制到部署产物。');
