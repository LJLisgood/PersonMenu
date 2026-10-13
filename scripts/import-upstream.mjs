import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const DEFAULT = '3dfa950f6daf0a5b311fc46619f1b559bac980c4';
export async function importUpstream(root, archive, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('必须指定完整 40 位上游 commit SHA');
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'zaotai-import-'));
  try {
    const entries = execFileSync('tar', ['-tzf', archive], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
      .split('\n')
      .filter(Boolean);
    if (entries.some((p) => p.startsWith('/') || p.split('/').includes('..')))
      throw new Error('归档包含不安全路径');
    execFileSync('tar', ['-xzf', archive, '-C', staging]);
    const [directory] = await fs.readdir(staging);
    if (directory !== `HowToCook-${commit}`)
      throw new Error('归档目录与指定 commit 不一致，请使用该版本的 GitHub tar.gz 归档');
    const source = path.join(staging, directory);
    const { walk, hash } = await import('./content.mjs');
    const files = await walk(path.join(source, 'dishes'));
    const recipes = files.filter((f) => f.endsWith('.md') && !f.includes('/template/'));
    const oldFile = path.join(root, 'content/howtocook/upstream.json');
    const old = JSON.parse(await fs.readFile(oldFile, 'utf8').catch(() => '{}'));
    const nextDir = path.join(root, 'content', `.howtocook-${Date.now()}`);
    await fs.mkdir(nextDir, { recursive: true });
    await fs.cp(path.join(source, 'dishes'), path.join(nextDir, 'dishes'), { recursive: true });
    // Include local linked kitchen notes so internal references are portable.
    await fs.cp(path.join(source, 'tips'), path.join(nextDir, 'tips'), { recursive: true });
    for (const name of ['LICENSE', 'README.md'])
      await fs.copyFile(path.join(source, name), path.join(nextDir, name));
    const checksums = {};
    for (const file of recipes)
      checksums[path.relative(source, file)] = hash(await fs.readFile(file));
    const changed = Object.keys(checksums).filter((p) => old.checksums?.[p] !== checksums[p]);
    const removed = Object.keys(old.checksums ?? {}).filter((p) => !checksums[p]);
    await fs.writeFile(
      path.join(nextDir, 'upstream.json'),
      JSON.stringify(
        {
          repository: 'Anduin2017/HowToCook',
          commit,
          license: 'Unlicense',
          recipeCount: recipes.length,
          importedAt: new Date().toISOString(),
          checksums,
          changes: { from: old.commit ?? null, changed, removed },
        },
        null,
        2,
      ),
    );
    const destination = path.join(root, 'content/howtocook');
    const backup = path.join(root, 'content', `.howtocook-backup-${Date.now()}`);
    const hadPrevious = await fs.stat(destination).catch(() => false);
    if (hadPrevious) await fs.rename(destination, backup);
    try {
      await fs.rename(nextDir, destination);
      const { buildContent } = await import('./build-content.mjs');
      await buildContent(root);
    } catch (error) {
      await fs.rm(destination, { recursive: true, force: true });
      if (hadPrevious) await fs.rename(backup, destination);
      throw error;
    }
    if (hadPrevious) await fs.rm(backup, { recursive: true, force: true });
    console.log(
      `已导入 ${recipes.length} 篇菜谱，变更 ${changed.length} 篇，移除 ${removed.length} 篇。个人目录未改动。`,
    );
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit') ? args[args.indexOf('--commit') + 1] : DEFAULT;
  try {
    let archive = args.includes('--archive')
      ? path.resolve(args[args.indexOf('--archive') + 1])
      : null;
    let temporary;
    if (!archive) {
      if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('commit 必须是完整 SHA');
      temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'zaotai-download-'));
      archive = path.join(temporary, 'source.tar.gz');
      console.log(`下载上游 ${commit}…`);
      execFileSync(
        'curl',
        [
          '-L',
          '--fail',
          '--max-time',
          '900',
          '--retry',
          '2',
          '-sS',
          '-o',
          archive,
          `https://codeload.github.com/Anduin2017/HowToCook/tar.gz/${commit}`,
        ],
        { stdio: 'inherit' },
      );
    }
    try {
      await importUpstream(process.cwd(), archive, commit);
    } finally {
      if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
