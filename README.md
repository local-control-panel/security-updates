# LCP Security Updates

Public security advisories and reviewed remediation packages from [Local Control Panel](https://github.com/local-control-panel). A static site and a versioned JSON feed, generated together and hosted on Cloudflare Pages.

**Current scope:** the catalog publisher, public website, package validation and engine integration contract. The Operations Engine consumer, unattended execution and panel integration are separate work. The initial PHP advisory has **no executable fix**: this repository does not claim to have patched any server.

## Run locally

Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npm run check
npm run dev
```

Open http://127.0.0.1:4321. Build output is `dist/`. There is no server runtime, database, telemetry or browser dependency bundle. Browser JavaScript only filters the already-rendered records and flags an expired catalog; the content remains readable without it.

## Cloudflare Pages

Connect this repository through **Workers & Pages → Create → Pages → Connect to Git**:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Production branch | `main` |
| Build command | `npm run check` |
| Build output directory | `dist` |
| Node.js | `22` (also pinned in `.node-version`) |

Connect the custom subdomain in the Pages project's Custom domains settings. No GitHub token or API key is needed in the site or client engine. Feed, manifest and payload requests go to Pages, not GitHub redirects. `_headers` configures revalidation for the discovery feed and immutable caching for release files. A real `404.html` prevents Pages' SPA fallback from answering missing feed files with the homepage.

See [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) and [serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

**Publishing model:** a reviewed merge to protected `main` is publication. Cloudflare builds/tests that commit and deploys the complete static artifact. Feature branches are previews, never client feed origins. There is no separate mutable file edited on the hosting server and no requirement to create a GitHub Release. Configure the engine with the production custom domain only.

Before connecting production, verify the repository ruleset requires the `check` CI status and owner review, protects `main` against deletion/force-push, and restricts bypass privileges. CODEOWNERS alone does not enforce this. Restrict Cloudflare deploy and DNS permissions too. GitHub/Cloudflare administrators remain part of the trust boundary; hashes from the same origin are integrity checks, not independent publisher signatures.

## Publish an advisory or fix

1. Open an issue or PR with an authoritative upstream source and affected platforms.
2. Copy the most recent `releases/NNNNNN.json` into the next sequence. Each file is a **full catalog snapshot**; retain previous advisories, relevant fixes and every revocation. Set current `publishedAt` and an `expiresAt` at most 31 days later. Increase the filename and `sequence` together.
3. For a fix, add immutable files in `payloads/<id>/<version>/`. Supply check/apply/verify entrypoints and platform, capability, restart, recovery and review/test evidence metadata. The build computes every payload hash and size. See [the contract](docs/feed-contract.md).
4. Run `npm run seal` to record the new manifest checksum, then `npm run check`. Commit the new `.sha256` beside the snapshot. Sealing refuses to overwrite a changed existing checksum. Review the preview, acquire owner approval and merge.

Never edit a published release snapshot or payload version; CI rejects this on PRs. Updates and withdrawals use a new snapshot; changed fix content or metadata needs a new fix version. Revocations are permanent and must be carried forward. Unreferenced local files are not copied into `dist`.

Expiry is deliberate: an engine must stop new applies when its latest accepted feed expires. Renew the catalog by publishing a new reviewed snapshot before expiry, even if the advisory content did not change. A timer on the client does not refresh the publisher's content automatically.

## Contribute

[Contributing](CONTRIBUTING.md) · [Feed and execution contract](docs/feed-contract.md) · [Security reporting](SECURITY.md) · [License](LICENSE)
