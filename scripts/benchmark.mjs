import fs from 'node:fs/promises';
import MiniSearch from 'minisearch';
import { performance } from 'node:perf_hooks';
import { queryRecipes, searchOptions } from './search.mjs';
const manifest = JSON.parse(await fs.readFile('public/data/manifest.json', 'utf8'));
const raw = await fs.readFile('public/data/search.json', 'utf8');
const search = MiniSearch.loadJSON(raw, searchOptions);
const samples = [];
for (let i = 0; i < 100; i++)
  for (const q of ['鸡蛋', '西红柿', '红烧肉', 'xhscjd', 'xihongshichaojidan', '小火']) {
    const start = performance.now();
    queryRecipes(search, manifest.recipes, { q });
    samples.push(performance.now() - start);
  }
samples.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      environment: `Node ${process.version} ${process.platform}/${process.arch}`,
      recipes: manifest.recipes.length,
      indexBytes: Buffer.byteLength(raw),
      samples: samples.length,
      p50ms: samples[Math.floor(samples.length * 0.5)],
      p95ms: samples[Math.floor(samples.length * 0.95)],
    },
    null,
    2,
  ),
);
