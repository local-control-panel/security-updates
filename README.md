# LCP Security Updates

Public security advisories and reviewed remediation packages from [Local Control Panel](https://github.com/local-control-panel). A static site and a versioned JSON feed, generated together and hosted on Cloudflare Pages.

**Current scope:** the catalog publisher, public website, package validation and engine integration contract. The Operations Engine consumer, unattended execution and panel integration are separate work. The initial PHP advisory has **no executable fix**: this repository does not claim to have patched any server.

## Publish an advisory or fix

1. Open an issue or PR with an authoritative upstream source and affected platforms.
2. Copy the most recent `releases/NNNNNN.json` into the next sequence. Each file is a **full catalog snapshot**; retain previous advisories, relevant fixes and every revocation. Set current `publishedAt` and an `expiresAt` at most 31 days later. Increase the filename and `sequence` together.
3. For a Docker image replacement, declare the managed component, affected image digests and the tested replacement digest using `action.type: "docker.image.replace"`; no downloaded shell scripts are needed. For a custom fix, add immutable check/apply/verify entrypoints in `payloads/<id>/<version>/`. Both forms require platform, capability, restart, recovery and review/test evidence metadata. See [the contract](docs/feed-contract.md).
4. Run `npm run seal` to record the new manifest checksum, then `npm run check`. Commit the new `.sha256` beside the snapshot. Sealing refuses to overwrite a changed existing checksum. Review the preview, acquire owner approval and merge.

Never edit a published release snapshot or payload version; CI rejects this on PRs. Updates and withdrawals use a new snapshot; changed fix content or metadata needs a new fix version. Revocations are permanent and must be carried forward. Unreferenced local files are not copied into `dist`.

Expiry is deliberate: an engine must stop new applies when its latest accepted feed expires. Renew the catalog by publishing a new reviewed snapshot before expiry, even if the advisory content did not change. A timer on the client does not refresh the publisher's content automatically.

## Contribute

[Contributing](CONTRIBUTING.md) · [Feed and execution contract](docs/feed-contract.md) · [Security reporting](SECURITY.md) · [License](LICENSE)
