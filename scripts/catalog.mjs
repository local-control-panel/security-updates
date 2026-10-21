import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const json = value => JSON.stringify(value, null, 2) + '\n';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unique = (values, label) => { if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`); };
export async function loadCatalog(root, { allowUnsealed = false } = {}) {
  const schema = JSON.parse(await readFile(join(root, 'schemas/release.schema.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const names = (await readdir(join(root, 'releases'))).filter(n => n.endsWith('.json')).sort();
  if (!names.length) throw new Error('At least one release is required');
  const releases = [];
  const payloadVersions = new Map();
  let lastSequence = 0, lastPublished = 0;
  for (const name of names) {
    if (!/^\d{6}\.json$/.test(name)) throw new Error(`Invalid release filename: ${name}`);
    const source = JSON.parse(await readFile(join(root, 'releases', name), 'utf8'));
    if (!validate(source)) throw new Error(`${name}: ${ajv.errorsText(validate.errors)}`);
    if (Number(name.slice(0, 6)) !== source.sequence || source.sequence <= lastSequence) throw new Error('Sequence must match filename and increase');
    const published = Date.parse(source.publishedAt), expires = Date.parse(source.expiresAt);
    if (published < lastPublished || expires <= published || expires - published > 31 * 86400000) throw new Error('Invalid release publication/expiry window');
    lastSequence = source.sequence; lastPublished = published;
    unique(source.advisories.map(a => a.id), 'advisory ID');
    unique(source.fixes.map(f => `${f.id}@${f.version}`), 'fix version');
    unique(source.revoked.map(f => `${f.id}@${f.version}`), 'revocation');
    const advisoryIds = new Set(source.advisories.map(a => a.id));
    for (const a of source.advisories) {
      if (Date.parse(a.updatedAt) < Date.parse(a.publishedAt) || Date.parse(a.updatedAt) > published) throw new Error('Invalid advisory dates');
      if (!a.references.length || !a.affected.length || !a.recommendations.length) throw new Error('Advisory needs sources, affected targets and recommendations');
    }
    const payloads = new Map();
    const fixes = [];
    for (const fix of source.fixes) {
      if (!advisoryIds.has(fix.advisoryId)) throw new Error(`Unknown advisory: ${fix.advisoryId}`);
      if (!fix.platforms.length || !fix.capabilities.length) throw new Error('Fix needs explicit platforms and capabilities');
      const identity = `${fix.id}@${fix.version}`;
      const transformed = fix.action
        ? { ...fix, execution: 'operator-policy-required' }
        : { ...fix, execution: 'operator-policy-required', artifacts: {} };
      if (!fix.action) {
        delete transformed.check; delete transformed.apply; delete transformed.verify;
      }
      const content = [];
      if (fix.action) {
        if (!fix.capabilities.includes('security.dockerImageReplace')) throw new Error('Image replacement requires security.dockerImageReplace capability');
        if (!fix.requiresRestart) throw new Error('Image replacement must declare a restart');
        if (fix.action.fromImages.includes(fix.action.toImage)) throw new Error('Replacement image is already listed as affected');
      }
      for (const phase of fix.action ? [] : ['check', 'apply', 'verify']) {
        const asset = fix[phase];
        if ((asset.runtime === 'bash') !== asset.file.endsWith('.sh')) throw new Error('Runtime does not match asset extension');
        const relative = `payloads/${fix.id}/${fix.version}/${asset.file}`;
        const absolute = resolve(root, relative);
        // Check every path component, not just the leaf: no symlink may escape the checkout.
        let current = root;
        for (const part of relative.split('/')) {
          current = join(current, part);
          if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink payloads are forbidden');
        }
        const stat = await lstat(absolute);
        if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Invalid payload size/type');
        const bytes = await readFile(absolute);
        const path = `fixes/${fix.id}/${fix.version}/${asset.file}`;
        payloads.set(path, bytes);
        transformed.artifacts[phase] = { path, runtime: asset.runtime, bytes: bytes.length, sha256: sha256(bytes) };
        content.push(sha256(bytes));
      }
      const fingerprint = sha256(json({ fix, content }));
      if (payloadVersions.has(identity) && payloadVersions.get(identity) !== fingerprint) throw new Error(`Published fix changed without a version bump: ${identity}`);
      payloadVersions.set(identity, fingerprint);
      fixes.push(transformed);
    }
    const manifest = { ...source, fixes };
    const bytes = json(manifest);
    if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) throw new Error('Manifest exceeds engine response limit');
    releases.push({ manifest, bytes, digest: sha256(bytes), payloads, directory: `releases/${name.slice(0, 6)}` });
  }
  // Revocations are permanent; a subsequent snapshot must carry them forward.
  const revoked = new Set();
  for (const release of releases) {
    const current = new Set(release.manifest.revoked.map(f => `${f.id}@${f.version}`));
    for (const old of revoked) if (!current.has(old)) throw new Error(`Revocation removed: ${old}`);
    for (const id of current) revoked.add(id);
  }
  // Freeze the generated bytes too: a future builder change must not silently
  // rewrite an archived manifest at an immutable URL.
  for (const release of releases) {
    const lockPath = join(root, 'releases', `${String(release.manifest.sequence).padStart(6, '0')}.sha256`);
    let expected;
    try { expected = (await readFile(lockPath, 'utf8')).trim(); }
    catch (error) { if (error.code !== 'ENOENT' || !allowUnsealed) throw error; }
    if (expected && expected !== release.digest) throw new Error('Sealed manifest changed: publish a new release and preserve archived serialization');
    if (expected === '') throw new Error('Empty manifest checksum');
  }
  return releases;
}
