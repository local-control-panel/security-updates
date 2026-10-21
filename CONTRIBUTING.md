# Contributing

Everyone can inspect the catalog and propose advisories, fixes or test evidence via issues and pull requests. Only owner-reviewed merges to the production branch publish a new catalog. Review does not guarantee a script is harmless; executable fixes run with the engine's privileges and require particular care.

Use an authoritative upstream advisory. Describe affected distributions/runtimes, vendor backports, compatibility checks, expected disruption and recovery. Never include client credentials or private inventory/logs. Do not upload exploit payloads to the public remediation catalog.

Prefer a declarative `docker.image.replace` rule for an image-only runtime update: list exact affected digests and the tested replacement digest, plus the engine-managed component. The engine performs the managed replacement; the catalog does not supply a free-form Docker command. See [the image rule contract](docs/feed-contract.md#docker-image-replacement-rule).

For remediation packages, provide reproducible test evidence for **every declared platform**: an affected fixture, unaffected fixture, unsupported environment, apply, verify, interrupted execution, retries and recovery. Use the check/apply/verify protocol in [the contract](docs/feed-contract.md). Shell/Python scripts need their own appropriate static checks and tests. A metadata-valid package alone is not ready for automatic execution.

Release snapshots and package versions are append-only. Add a new snapshot for updated advice, a new fix version for any changed script/metadata, and a permanent revocation for unsafe versions. Run `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm check`, then inspect both the public page and generated feed. Owner approval and required CI must be configured as repository rules; CODEOWNERS is only the ownership declaration.
