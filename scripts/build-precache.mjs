import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = resolve('dist/client');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(resolve(directory, entry.name))
          : resolve(directory, entry.name),
      ),
    )
  ).flat();
}

const files = (await walk(resolve(root, '_next/static')))
  .filter((file) => /\.(?:js|css|woff2?|png|svg)$/.test(file))
  .sort();
const source = await readFile('public/sw.js', 'utf8');
if (!source.includes('const PRECACHE = [];'))
  throw new Error('Service worker precache placeholder is missing');
const hash = createHash('sha256').update(source);
for (const file of [
  ...files,
  ...['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'].map(
    (name) => resolve(root, name),
  ),
]) {
  hash.update(await readFile(file));
}
const revision = hash.digest('hex').slice(0, 12);
const assets = files.map(
  (file) => '/' + relative(root, file).split(sep).join('/'),
);
const worker = source
  .replace(/const CACHE = .*?;/, `const CACHE = 'pulse-foundry-${revision}';`)
  .replace(
    'const PRECACHE = [];',
    `const PRECACHE = ${JSON.stringify(assets)};`,
  );
await writeFile(resolve(root, 'sw.js'), worker);
console.log(
  `Offline shell: ${assets.length} bundled assets precached (revision ${revision}).`,
);
