import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadCatalog, json, sha256, escapeHtml as e } from './catalog.mjs';

const repo = 'https://github.com/local-control-panel/security-updates';
const list = items => `<ul>${items.map(v => `<li>${e(v)}</li>`).join('')}</ul>`;
const date = value => new Date(value).toISOString().slice(0, 10);
const label = value => value.replaceAll('-', ' ');
const badge = (value, extra = '') => `<span class="badge ${e(extra)}">${e(label(value))}</span>`;
export async function build(root, output = join(root, 'dist')) {
  const releases = await loadCatalog(root);
  const latest = releases.at(-1);
  let revision;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { revision = 'uncommitted'; }
  const manifestPath = `${latest.directory}/manifest.json`;
  const index = { schemaVersion: 1, sequence: latest.manifest.sequence, publishedAt: latest.manifest.publishedAt, expiresAt: latest.manifest.expiresAt, manifest: { path: `/${manifestPath}`, bytes: Buffer.byteLength(latest.bytes), sha256: latest.digest } };
  // Validate and read all inputs before replacing the output tree.
  const css = await readFile(join(root, 'web/style.css'));
  const js = await readFile(join(root, 'web/catalog.js'));
  const cssPath = `/assets/style-${sha256(css).slice(0, 16)}.css`;
  const jsPath = `/assets/catalog-${sha256(js).slice(0, 16)}.js`;
  const shell = (title, content) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Public security advisories and reviewed remediation packages from Local Control Panel."><title>${e(title)} · LCP Security</title><link rel="stylesheet" href="${cssPath}"><script src="${jsPath}" defer></script></head><body><header class="topbar"><a class="brand" href="/"><span class="brand-icon" aria-hidden="true">L</span>LOCAL CONTROL PANEL<span class="brand-sub"> / SECURITY</span></a><nav aria-label="Main"><a href="/feed/v1/index.json">JSON feed ↗</a><a href="${repo}">GitHub ↗</a></nav></header><main>${content}</main><footer><span>Maintained by Local Control Panel. Open to contributions.</span><a href="${repo}/blob/main/docs/feed-contract.md">Engine contract ↗</a><span>Release ${latest.manifest.sequence.toString().padStart(6, '0')} · ${e(revision.slice(0, 12))}</span></footer></body></html>`;
  const m = latest.manifest;
  const revoked = fix => m.revoked.some(r => r.id === fix.id && r.version === fix.version);
  const activeFixes = m.fixes.filter(f => !revoked(f));
  const fixCard = fix => `<article class="fix"><div>${badge(revoked(fix) ? 'revoked' : 'reviewed-package', revoked(fix) ? 'critical' : 'mint')}<h3>${e(fix.title)}</h3></div><p>Version ${e(fix.version)} · Engine ≥ ${e(fix.minEngine)}</p><p>${e(fix.disruption)}</p><p>Recovery: ${e(fix.recovery)}</p><a href="/${manifestPath}">Package hashes &amp; execution metadata ↗</a></article>`;
  const cards = m.advisories.map(a => {
    const fixes = activeFixes.filter(f => f.advisoryId === a.id);
    return `<article class="advisory" data-advisory data-severity="${e(a.severity)}" data-status="${e(a.status)}" data-search="${e([a.title, a.summary, ...a.cves].join(' ').toLowerCase())}"><div class="card-meta">${badge(a.severity, a.severity)}${badge(a.status)}<time datetime="${e(a.updatedAt)}">${date(a.updatedAt)}</time></div><h3><a href="/advisories/${e(a.id)}/">${e(a.title)} <span aria-hidden="true">↗</span></a></h3><p>${e(a.summary)}</p><div class="card-bottom"><span class="mono">${e(a.cves.join(' / ') || a.id)}</span><span>${fixes.length ? `${fixes.length} reviewed package(s)` : 'Manual action · no automatic package'}</span></div></article>`;
  }).join('');
  const content = `<section class="hero"><p class="eyebrow"><span class="dot"></span>PUBLIC SECURITY CATALOG</p><h1>Know what changed.<br><span>Know what to fix.</span></h1><p class="intro">Security advisories, reviewed fixes and a public record of every release. Built for operators. Ready for automation.</p><div class="hero-actions"><a class="button" href="#advisories">Browse advisories <span>↓</span></a><a class="text-link" href="${repo}/blob/main/CONTRIBUTING.md">Help with a fix ↗</a></div><div class="release-note" data-expiry="${e(m.expiresAt)}"><span class="dot"></span><span>Catalog published ${date(m.publishedAt)} · expires ${date(m.expiresAt)}. This is publication status, not your server's security status.</span></div></section><section class="stats" aria-label="Catalog overview"><div><span class="stat-value">${m.advisories.length.toString().padStart(2, '0')}</span><span>Published advisories</span></div><div><span class="stat-value">${activeFixes.length.toString().padStart(2, '0')}</span><span>Available remediation packages</span></div><div><span class="stat-value">01h</span><span>Recommended engine check interval</span></div></section><section id="advisories"><div class="section-heading"><div><p class="eyebrow">THE PUBLIC RECORD</p><h2>Advisories &amp; fixes</h2></div><span class="muted">Latest catalog · #${m.sequence.toString().padStart(6, '0')}</span></div><form class="filters" role="search"><label class="search">Search advisories<input type="search" name="search" placeholder="Search title, CVE or description…" autocomplete="off"></label><label>Severity<select name="severity"><option value="">All severities</option>${['critical','high','medium','low','informational'].map(s => `<option value="${s}">${label(s)}</option>`).join('')}</select></label><label>Status<select name="status"><option value="">All statuses</option>${['investigating','action-required','resolved','withdrawn'].map(s => `<option value="${s}">${label(s)}</option>`).join('')}</select></label></form><p class="result-count" aria-live="polite">${m.advisories.length} advisory record(s)</p><div class="advisories">${cards}</div><p class="empty" hidden>No advisories match your search. Try another CVE or clear the filters.</p></section><section class="automation"><div><p class="eyebrow">ONE SOURCE. TWO AUDIENCES.</p><h2>Readable by people.<br>Consumable by engines.</h2><p>The same release generates this site and the machine feed. Client-side execution requires engine support and an enabled server policy. Publishing an advisory alone does not update a server.</p><a class="text-link" href="${repo}/blob/main/docs/feed-contract.md">Read the integration contract ↗</a></div><div class="code-panel"><div class="code-title">FEED V1 <a href="/feed/v1/index.json">OPEN JSON ↗</a></div><pre><code>GET /feed/v1/index.json\n\nCheck revision &amp; expiry\nVerify manifest &amp; file hashes\nMatch runtime &amp; server policy\nCheck → apply → verify</code></pre><p>Public metadata. No client inventory collection.</p></div></section>`;
  await rm(output, { recursive: true, force: true });
  const write = async (path, bytes) => { const target = join(output, path); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, bytes); };
  for (const release of releases) {
    await write(`${release.directory}/manifest.json`, release.bytes);
    for (const [path, bytes] of release.payloads) await write(`${release.directory}/${path}`, bytes);
  }
  await write('feed/v1/index.json', json(index));
  await write('schemas/release.schema.json', await readFile(join(root, 'schemas/release.schema.json')));
  await write(cssPath.slice(1), css); await write(jsPath.slice(1), js);
  await write('index.html', shell('Security advisories & fixes', content));
  for (const a of m.advisories) {
    const fixes = m.fixes.filter(f => f.advisoryId === a.id);
    await write(`advisories/${a.id}/index.html`, shell(a.title, `<a class="back" href="/#advisories">← All advisories</a><article class="detail"><div class="card-meta">${badge(a.severity, a.severity)}${badge(a.status)}</div><h1>${e(a.title)}</h1><p class="intro">${e(a.summary)}</p><p class="mono muted">${e(a.cves.join(' · '))}</p><p class="muted">Published ${date(a.publishedAt)} · Updated ${date(a.updatedAt)}</p><section><h2>Affected environments</h2>${list(a.affected)}</section><section><h2>Recommended action</h2>${list(a.recommendations)}</section><section><h2>Automation packages</h2>${fixes.length ? fixes.map(fixCard).join('') : '<div class="notice">No automatic remediation package is available in this catalog. Follow the recommendations above and the upstream advisory. Engine automation cannot apply a fix until a reviewed package is published.</div>'}</section><section><h2>Sources</h2><ul>${a.references.map(ref => `<li><a href="${e(ref.url)}">${e(ref.label)} ↗</a></li>`).join('')}</ul></section><a class="button" href="${repo}/issues/new/choose">Report a problem / contribute ↗</a></article>`));
  }
  await write('404.html', shell('Page not found', '<section class="hero"><p class="eyebrow">404</p><h1>Nothing at this address.</h1><a class="button" href="/">Back to the catalog</a></section>'));
  await write('_headers', `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\n/feed/*\n  Cache-Control: public, max-age=0, must-revalidate\n  Access-Control-Allow-Origin: *\n/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
  return { index, releases: releases.length, output };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await build(resolve(fileURLToPath(new URL('..', import.meta.url)))));
}
