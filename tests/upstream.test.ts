import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { importUpstream } from '../scripts/import-upstream.mjs';
import { collectUpstreamData } from '../scripts/upstream-data.mjs';
import { walk } from '../scripts/content.mjs';

describe('data-only upstream import', () => {
  it('imports recipes and recursive references without project files or unused assets', async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'upstream-test-'));
    const commit = 'a'.repeat(40);
    const name = `HowToCook-${commit}`;
    const source = path.join(temporary, name);
    const root = path.join(temporary, 'site');
    const recipe = '# 测试菜的做法\n\n## 操作\n\n1. [腌制](../../tips/learn/腌制.md)\n';
    const fixture = {
      LICENSE: 'Unlicense fixture',
      'README.md': '# Upstream project',
      'package.json': '{}',
      '.github/workflows/build.yml': 'unused',
      'dishes/vegetable_dish/测试菜.md': recipe,
      'dishes/template/example.md': '# Template',
      'dishes/vegetable_dish/unused.jpg': 'unused',
      'tips/learn/腌制.md': '[说明][note]\n\n[note]: ../说明.md\n',
      'tips/说明.md': '[返回](learn/腌制.md)\n\n![图](./images/图.png)\n',
      'tips/images/图.png': 'fixture asset',
      'tips/unused.md': '# Unused',
    };
    try {
      for (const [relative, contents] of Object.entries(fixture)) {
        const file = path.join(source, relative);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, contents);
      }
      await fs.mkdir(path.join(root, 'content/personal'), { recursive: true });
      await fs.writeFile(path.join(root, 'content/personal/keep.txt'), 'personal');
      const archive = path.join(temporary, 'source.tar.gz');
      execFileSync('tar', ['-czf', archive, '-C', temporary, name]);
      await importUpstream(root, archive, commit);
      const destination = path.join(root, 'content/howtocook');
      expect(
        (await walk(destination)).map((file: string) => path.relative(destination, file)),
      ).toEqual([
        'LICENSE',
        'dishes/vegetable_dish/测试菜.md',
        'tips/images/图.png',
        'tips/learn/腌制.md',
        'tips/说明.md',
        'upstream.json',
      ]);
      expect(
        await fs.readFile(path.join(destination, 'dishes/vegetable_dish/测试菜.md'), 'utf8'),
      ).toBe(recipe);
      expect(await fs.readFile(path.join(root, 'content/personal/keep.txt'), 'utf8')).toBe(
        'personal',
      );
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });

  it('keeps the checked-in snapshot limited to the selected data', async () => {
    const source = path.resolve('content/howtocook');
    const { files } = await collectUpstreamData(source);
    expect(await walk(source)).toEqual([...files, path.join(source, 'upstream.json')].sort());
  });
});
