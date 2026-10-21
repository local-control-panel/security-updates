# Feed v1 and engine integration contract

Status: publisher implemented; engine consumer and execution remain to be implemented and tested in Operations Engine. The endpoint origin is selected when the Cloudflare Pages project/custom domain is connected.

## Discovery

Poll `GET /feed/v1/index.json` on the **configured production HTTPS origin** approximately hourly, with jitter, conditional requests and failure backoff. Do not use GitHub or preview deployment URLs as an automatic fallback. The publisher uses Cloudflare Pages ETags and `_headers` revalidation.

```json
{
  "schemaVersion": 1,
  "sequence": 1,
  "publishedAt": "2026-10-21T18:46:51Z",
  "expiresAt": "2026-11-20T18:46:51Z",
  "manifest": {
    "path": "/releases/000001/manifest.json",
    "bytes": 1690,
    "sha256": "<64 lowercase hex characters>"
  }
}
```

This example is illustrative; use the generated endpoint for exact values. Validate schema/version, sizes, time fields and paths before use. Reject unsupported fields that affect execution rather than guessing. Bound responses (recommended: index 16 KiB, manifest 4 MiB, payload 1 MiB), enforce timeouts, and reject cross-origin redirects and non-HTTPS addresses. Resolve the manifest relative to the configured origin; reject authority/scheme changes, traversal, query strings and fragments. Hash the exact downloaded bytes before parsing or executing them.

Persist the highest accepted sequence and its manifest hash on the server. Lower sequence or changed hash at the same sequence is a replay/tamper error. A `304` response does not extend `expiresAt`; use only the already-validated cached bytes and check their expiry again. Reject future-dated publication beyond a small clock tolerance and fail closed if the clock is unreliable. An expired/unavailable feed means unknown freshness, never proof that a machine is safe. No new automatic apply is permitted without an unexpired validated snapshot. Interruption recovery follows the persisted operation state rather than blindly starting an old fix again.

## Release manifest

Every `releases/NNNNNN.json` is a complete source snapshot. Its `.sha256` sidecar freezes the generated manifest bytes, including against accidental future serializer changes. New snapshots are sealed with `pnpm seal`. Source snapshots are validated against [`release.schema.json`](../schemas/release.schema.json). The generated manifest has the same advisories, sequence, timestamps and revocations. For script fixes, source `check`, `apply`, `verify` fields are replaced by `artifacts`, with relative paths, byte counts, runtimes and SHA-256. Declarative fixes retain their `action` unchanged and have no script artifacts. Paths are relative to that manifest's directory, e.g. `fixes/php-runtime-update/1.0.0/check.sh`.

Advisory status describes the publisher's record, not the client machine. In particular, `resolved` is not a per-server verification result. No package means no automated remediation for that advisory. An advisory marked `withdrawn` must not authorize a new automatic execution. Revocations are `(id, version, reason)` entries. They prohibit new execution but do not automatically revert previously applied changes.

The engine must reject sequence/date inconsistency between index and manifest, unknown advisory references, unknown runtimes, missing required capabilities, incompatible engine versions, or insufficiently specific platform matching. Do not infer compatibility from a matching PHP version string alone: account for vendor backports and the actual serving runtime/container.

## Docker image replacement rule

For a known container image vulnerability, prefer a declarative action over downloaded scripts. The rule says **which managed component, which affected image digests, and which tested replacement image**. The engine owns the replacement procedure.

Example of the `action` field (illustrative digests, **not a published fix**):

```json
{
  "type": "docker.image.replace",
  "component": "php-runtime",
  "fromImages": [
    "ghcr.io/local-control-panel/frankenphp@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ],
  "toImage": "ghcr.io/local-control-panel/frankenphp@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
}
```

The surrounding fix still needs ID/version, advisory, supported platforms, minimum engine, review/test evidence and recovery metadata. It must declare `requiresRestart: true` and the proposed engine capability `security.dockerImageReplace`. A rule cannot also supply script entrypoints. Mutable tags, an empty affected-image list and a replacement that is itself listed as affected are rejected by the publisher. The example is only documentation; its images are not verified and it is not included in the feed.

The engine capability is **not implemented yet**. Its required behavior:

1. Resolve `component` against its own inventory of engine-managed services. This is not a container name or permission to update arbitrary containers. Select only a matching managed component and affected current digest on a declared supported platform; skip unknown/custom layouts. If the target digest is already active, verify it and avoid another replacement.
2. Reconcile the running image's local image ID with the registry/index/platform digest. A string in a Compose file or an old cached inventory is insufficient. Require a target image compatible with the component's PHP minor version, extensions, architecture, configuration and volume layout; automatic data/schema migrations are outside this action.
3. Check the server policy, restart window, target health prerequisites and recovery readiness, acquire the normal operation lock and persist the exact current configuration/image for recovery. Pull the exact target digest and verify the platform image before changing the serving runtime.
4. Update the engine-owned desired state to that image and recreate only the selected container/service. Preserve the existing environment, secrets, ports, networks and volume mounts through the normal managed deployment pipeline. Never use `compose down -v`, renew volumes or rebuild a container from guessed defaults. Pulling an image or restarting the old container does not replace its image.
5. Verify the active image identity, expected PHP/runtime state and component/application health before marking fixed. On failure, use the recorded compatible recovery procedure; restoring an affected image leaves the advisory unresolved.

Docker Compose documents that an image/configuration change recreates the service while preserving mounted volumes: [docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/). The engine must additionally implement the inventory, policy and verification checks above. Review evidence must demonstrate that the chosen replacement actually contains the security patch; the catalog cannot establish that from a digest alone.

## Execution package

A fix declares `id`, semantic `version`, `advisoryId`, `title`, `minEngine`, exact `platforms`, required engine `capabilities`, `requiresRestart`, `disruption`, `recovery`, and `review.source` / `review.evidence` URLs. For custom script fixes, the build requires three separate entrypoints, using `bash` (`.sh`) or `python3` (`.py`). All three are integrity-checked before any executes. Package scripts are self-contained and may not fetch unversioned/unverified executable code. Dependencies require an explicit future contract extension; they are not implicitly trusted.

Proposed execution protocol for engine implementation:

- No shell interpolation. Invoke a verified root-owned local file with its declared interpreter; no arbitrary caller-supplied commands or repository URLs.
- `check`: read-only inspection; exit 0 = affected, 10 = not affected, 20 = unsupported/unknown. Other exit codes mean failure. No output parsing may turn an error into permission to apply.
- `apply`: exit 0 = changes completed, other exit codes = failure requiring declared recovery. This stage alone never proves the vulnerability fixed.
- `verify`: read-only; exit 0 = expected patched state confirmed, any other result = unverified/failed.
- Apply requires server-owned explicit opt-in for future official packages, platform/capability compatibility, permitted restart/disruption and maintenance window, as well as package-specific prerequisites.
- Lock per target with the normal engine operation pipeline; persist `(fix ID, version, target, manifest hash)`, stage, result, timestamps and bounded logs. Recheck actual state on retries. Never run concurrent timer and panel operations on the same target.
- A rollback to a vulnerable runtime leaves the advisory unresolved. Repeated ticks must not cause repeated destructive attempts. Timeouts, process limits, failure retries and crash recovery must be designed and tested in the engine before enabling unattended apply.

Hashes detect mismatches, not malicious maintainers. The trust model is reviewed, protected source and controlled production deployment, consistent with the existing agents registry. This repo currently has no independent signature trust root. Production hosting administrators can replace both content and hashes; do not describe this feed as cryptographically authenticated by the publisher.

## Subsequent integration work

1. Confirm the production origin and access controls; test actual HTTP cache/ETag behavior and all endpoint limits.
2. Implement an engine consumer, root-owned policy, systemd timer/cron, locking, local inventory and persisted check/apply/verify results. Exercise disabled policy, expiry, replay, tampered files, missing capabilities, unknown targets, crash recovery and failed verification on real test machines.
3. Publish the first genuinely tested remediation package. The PHP advisory in snapshot 1 intentionally has no scripts or claimed test evidence.
4. Add the deferred panel task: per-server policy and restart window, manual check/apply through the same engine operations, freshness, affected targets, progress, history and recovery status. Automation must remain independent of the desktop lifetime.
