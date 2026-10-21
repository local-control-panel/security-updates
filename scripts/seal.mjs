import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const release of await loadCatalog(root, { allowUnsealed: true })) {
  const path = join(root, 'releases', `${String(release.manifest.sequence).padStart(6, '0')}.sha256`);
  try { await writeFile(path, release.digest + '\n', { flag: 'wx' }); console.log(`Sealed ${path}`); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
