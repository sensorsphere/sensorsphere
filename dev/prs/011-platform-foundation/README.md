# PR-011 — Platform Foundation

## Revision

2

## Compatibility

This is a transition PR.

It includes both:

- `metadata.json` for the existing PR engine
- `manifest.json` for the new PR engine

The current PR engine can extract this archive. Applying the PR installs the
new PR engine.

## Objective

Introduce:

- PR manifest schema v2
- SHA-256 payload verification
- enriched `pr info`
- project changelog
- architecture documentation
- development workflow documentation
- API guidelines
- project roadmap

## Runtime impact

None.

No application runtime, database schema, API behavior or frontend behavior is changed.

## Apply

```bash
./dev/tools/pr apply 011
```

## Verify

```bash
./dev/tools/pr verify 011
```

## Rollback

```bash
./dev/tools/pr rollback 011
```
