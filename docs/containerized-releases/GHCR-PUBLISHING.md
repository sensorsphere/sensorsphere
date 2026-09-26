# GHCR Publication Runbook

This runbook covers the repository and GitHub Container Registry preparation required before SensorSphere application images are published for DIT/PROD use.

## 1. Preconditions

- Confirm the GitHub owner/organization is `sensorsphere` or override `SENSORSPHERE_IMAGE_NAMESPACE`.
- Confirm no secrets, credentials, private endpoints, private certificates, dumps, or runtime data are tracked.
- Review Git history before changing a private repository to public; making the repository public exposes the code and GitHub Actions history.
- Confirm organization policy allows repository visibility changes.

## 2. Make the repository public, when that is the intended distribution model

GitHub UI:

1. Open the SensorSphere repository.
2. Open **Settings**.
3. In **Danger Zone**, choose **Change repository visibility**.
4. Select **Public**.
5. Review GitHub's listed consequences and confirm the repository name.
6. Confirm **Make this repository public**.

Do not perform this step until the security review above is complete. Repository visibility and GHCR package visibility must be checked separately.
## 3. Authenticate for command-line publication

GHCR command-line authentication uses a GitHub personal access token (classic). Store the token outside the repository.

Required scopes depend on the operation. For publication, the token needs package write access. Use the least privilege required.

Example:

```bash
export CR_PAT='<token>'
printf '%s' "$CR_PAT" | docker login ghcr.io -u '<github-user>' --password-stdin
```

Never store `CR_PAT` in `.env`, scripts, the repository, or shell history.

For GitHub Actions, prefer the repository's `GITHUB_TOKEN` and grant the workflow only the required package permissions.

## 4. Package/repository association

Published images carry the OCI source label pointing to the repository that
built them. The release script derives it from `remote.origin.url`.

This allows GitHub to associate a container package with its source repository.
The main repository and container namespace are both owned by the
`sensorsphere` organization:

- source: `https://github.com/sensorsphere/sensorsphere`
- registry namespace: `ghcr.io/sensorsphere`

The release workflow authenticates to GHCR with the repository `GITHUB_TOKEN`
and requests `packages: write`. Existing packages must be connected to
`sensorsphere/sensorsphere` and grant that repository GitHub Actions write
access before the workflow can publish a new version.
## 5. Package visibility

A newly published container package may be private. After the first publication, verify each package:

- `sensorsphere-api`
- `sensorsphere-frontend`
- `sensorsphere-ingestion-service`
- `sensorsphere-nginx`
- `sensorsphere-migrations`

For each package, open **Package settings** and check **Danger Zone -> Change visibility**. Select **Public** when anonymous DIT/PROD pulls are required.

Public GHCR container packages can be pulled anonymously. Do not assume that making the source repository public automatically makes an existing package public.

## 6. Tagging policy

The release script publishes:

- the explicit component version tag, for example `1.44.0` or migration level `72`;
- an immutable full-commit tag, for example `sha-<40-character-git-sha>`.

Before publication, the release script rejects an existing version or SHA tag;
release tags are never overwritten. The Stack Release uses explicit component
version tags. SensorSphere intentionally publishes no moving `latest` tag.

Official image platforms are:

```text
linux/amd64
linux/arm64
```

## 7. Verification after publication

For every image:

```bash
docker buildx imagetools inspect ghcr.io/sensorsphere/<image>:<version>
docker pull ghcr.io/sensorsphere/<image>:<version>
```

Verify that both target architectures are present and that the OCI source/revision labels match the release source.

Published images include BuildKit provenance and SBOM attestations
(`--provenance=mode=max --sbom=true`). Cryptographic image signing is not
enabled in this first release workflow; adding keyless signing later requires a
separate trust/identity policy and is not needed for Stack Release integrity.

## 8. GitHub Actions and Stack Release publication

The manual workflow is:

```text
.github/workflows/container-release.yml
```

It validates the selected manifest against the checked-out source, configures
QEMU/Buildx, authenticates to GHCR, publishes only the modules supplied in the
workflow input, builds the minimal distribution bundle, and creates an immutable
GitHub Release tagged:

```text
stack-<stackVersion>
```

The GitHub Release contains the Stack Release manifest, the distribution
`.tar.gz`, and its SHA-256 checksum. Reusing an existing Stack Release tag is
rejected.

The workflow grants `contents: write` to create the GitHub Release and
`packages: write` to publish GHCR images. No application secret is stored in
the repository.

## References

- https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
