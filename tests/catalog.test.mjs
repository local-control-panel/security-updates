import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadCatalog, sha256 } from '../scripts/catalog.mjs';
import { build as buildSite } from '../scripts/build.mjs';
// Mutated test snapshots are unpublished fixtures: seal their expected bytes.
async function build(root) {
  for (const r of await loadCatalog(root, { allowUnsealed: true })) {
    await writeFile(join(root, 'releases', `${String(r.manifest.sequence).padStart(6,'0')}.sha256`), r.digest + '\n');
  }
  return buildSite(root);
}
const source = resolve(import.meta.dirname, '..');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'lcp-security-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  for (const dir of ['schemas','releases','web']) await cp(join(source,dir), join(root,dir), { recursive:true });
  return root;
}
async function change(root, mutate, name='000001.json') {
  const path = join(root, 'releases', name);
  const data = JSON.parse(await readFile(path)); mutate(data);
  await rm(path.replace('.json', '.sha256'), { force:true });
  await writeFile(path, JSON.stringify(data)); return data;
}
async function addFix(root) {
  const path = join(root,'payloads/test-fix/1.0.0'); await mkdir(path, { recursive:true });
  for (const phase of ['check','apply','verify']) await writeFile(join(path,`${phase}.sh`),'#!/bin/bash\nexit 0\n');
  await change(root, r => r.fixes.push({id:'test-fix',version:'1.0.0',advisoryId:r.advisories[0].id,title:'Test only',minEngine:'1.0.0',platforms:['debian-12/amd64'],capabilities:['test.fixture'],requiresRestart:true,disruption:'Test restart',recovery:'Test recovery',...Object.fromEntries(['check','apply','verify'].map(p=>[p,{file:`${p}.sh`,runtime:'bash'}])),review:{source:'https://example.com/review',evidence:'https://example.com/test'}}));
  return path;
}
test('all generated manifest and payload hashes verify; published site and feed agree', async t => {
  const root = await fixture(t); await addFix(root); await build(root);
  const index = JSON.parse(await readFile(join(root,'dist/feed/v1/index.json')));
  const bytes = await readFile(join(root,'dist',index.manifest.path));
  assert.equal(sha256(bytes),index.manifest.sha256); assert.equal(bytes.length,index.manifest.bytes);
  const manifest = JSON.parse(bytes); assert.equal(index.sequence,manifest.sequence);
  for (const asset of Object.values(manifest.fixes[0].artifacts)) {
    const payload = await readFile(join(root,'dist',index.manifest.path,'..',asset.path));
    assert.equal(sha256(payload),asset.sha256); assert.equal(payload.length,asset.bytes);
  }
  const html = await readFile(join(root,'dist/index.html'),'utf8');
  assert.ok(html.includes(manifest.advisories[0].title));
  assert.ok(html.includes('01</span><span>Available remediation packages'));
  assert.ok(await readFile(join(root,'dist/404.html')));
});
test('build is deterministic for the same release inputs', async t => {
  const root = await fixture(t); const first = await build(root); const second = await build(root);
  assert.deepEqual(first.index,second.index);
});
test('schema rejects extra fields and non-HTTPS sources', async t => {
  const root = await fixture(t);
  await change(root,r => {r.command='curl | bash';}); await assert.rejects(loadCatalog(root), /additional properties/);
  await change(root,r => {delete r.command; r.advisories[0].references[0].url='javascript:alert(1)';});
  await assert.rejects(loadCatalog(root), /pattern/);
});
test('HTML escapes contributor-supplied text and attributes', async t => {
  const root = await fixture(t); await change(root,r=>{r.advisories[0].title='<img src=x onerror=alert(1)>';});
  await build(root); const html = await readFile(join(root,'dist/index.html'),'utf8');
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img src=x'));
});
test('rejects duplicate advisories, wrong sequence, bad expiry and dangling fixes', async t => {
  for (const mutation of [r=>r.advisories.push(r.advisories[0]),r=>r.sequence=2,r=>r.expiresAt=r.publishedAt]) {
    const root=await fixture(t); await change(root,mutation); await assert.rejects(loadCatalog(root));
  }
  const root=await fixture(t); await addFix(root); await change(root,r=>r.fixes[0].advisoryId='missing'); await assert.rejects(loadCatalog(root), /Unknown advisory/);
});
test('payload traversal, symlinks, oversized files and runtime mismatch fail closed', async t => {
  const root=await fixture(t); const path=await addFix(root);
  await change(root,r=>r.fixes[0].apply.file='../../outside.sh'); await assert.rejects(loadCatalog(root), /pattern/);
  await change(root,r=>r.fixes[0].apply.file='apply.sh');
  await rm(join(path,'apply.sh')); await symlink(join(path,'check.sh'),join(path,'apply.sh')); await assert.rejects(loadCatalog(root), /Symlink/);
  await rm(join(path,'apply.sh')); await writeFile(join(path,'apply.sh'),'x'.repeat(1024*1024+1)); await assert.rejects(loadCatalog(root), /size/);
  await writeFile(join(path,'apply.sh'),'exit 0'); await change(root,r=>r.fixes[0].apply.runtime='python3'); await assert.rejects(loadCatalog(root), /Runtime/);
});
test('same fix version cannot change metadata or payload between releases', async t => {
  const root=await fixture(t); await addFix(root);
  const old=JSON.parse(await readFile(join(root,'releases/000001.json')));
  const next=structuredClone(old); next.sequence=2; next.fixes[0].recovery='Changed recovery without a version bump';
  await writeFile(join(root,'releases/000002.json'),JSON.stringify(next));
  await assert.rejects(loadCatalog(root), /version bump/);
});
test('revocations cannot disappear; archived releases remain in generated output', async t => {
  const root=await fixture(t); const old=await change(root,r=>r.revoked.push({id:'retired-fix',version:'1.0.0',reason:'Withdrawn'}));
  const next=structuredClone(old); next.sequence=2; next.revoked=[];
  await writeFile(join(root,'releases/000002.json'),JSON.stringify(next)); await assert.rejects(loadCatalog(root), /Revocation removed/);
  next.revoked=old.revoked; await writeFile(join(root,'releases/000002.json'),JSON.stringify(next));
  await build(root); assert.ok(await readFile(join(root,'dist/releases/000001/manifest.json'))); assert.ok(await readFile(join(root,'dist/releases/000002/manifest.json')));
});
test('sealed manifest cannot change, including through a future serializer change', async t => {
  const root = await fixture(t);
  const path = join(root, 'releases/000001.json');
  const data = JSON.parse(await readFile(path)); data.advisories[0].title = 'Altered after publication';
  await writeFile(path, JSON.stringify(data));
  await assert.rejects(loadCatalog(root), /Sealed manifest changed/);
});
