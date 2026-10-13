import fs from 'node:fs/promises';
import path from 'node:path';
import { walk, markdownReferences, localTarget } from './content.mjs';

// Keep original paths and bytes; follow references recursively for kitchen notes.
export async function collectUpstreamData(source) {
  source = path.resolve(source);
  const available = new Set(await walk(source));
  const recipes = [...available].filter((file) => {
    const relative = path.relative(source, file);
    return (
      relative.startsWith(`dishes${path.sep}`) &&
      file.endsWith('.md') &&
      !relative.split(path.sep).includes('template')
    );
  });
  const selected = new Set(recipes);
  for (const file of selected) {
    if (!file.endsWith('.md')) continue;
    const references = markdownReferences(await fs.readFile(file, 'utf8'));
    for (const ref of references) {
      const target = localTarget(ref.url, file, source);
      if (!target || !available.has(target)) continue;
      const relative = path.relative(source, target);
      // Only cooking data belongs in the snapshot, never upstream project files.
      if (!/^(dishes|tips)[/\\]/.test(relative) || relative.split(path.sep).includes('template'))
        continue;
      selected.add(target);
    }
  }
  if (!available.has(path.join(source, 'LICENSE'))) throw new Error('上游缺少 LICENSE');
  selected.add(path.join(source, 'LICENSE'));
  return { recipes, files: [...selected].sort() };
}
