# Release process

This repository uses **Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH`.
See https://semver.org/ for the full specification.

## Versioning strategy

We use a **single global version** for the whole repository:

- root `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`

All packages must stay on the **same version** to keep releases simple and consistent.

### When to bump versions

- **PATCH** (`x.y.Z`)
    - Bug fixes
    - Refactors with no behavior change
    - Documentation updates
    - Dependency updates with no user-visible impact

- **MINOR** (`x.Y.z`)
    - New features (user-visible value)
    - Improvements that do not break existing behavior
    - Additive changes to public APIs/types (backwards compatible)

- **MAJOR** (`X.y.z`)
    - Breaking changes (behavior, data, API contracts)
    - Significant UX changes that alter workflows
    - Major database/schema changes that require special upgrade steps

## Git tags

Releases are tagged using the format:

- `vMAJOR.MINOR.PATCH` (example: `v1.6.14`)

## Tools

### Sync versions across workspaces

To keep a single global version, we provide a helper script:

- `tools/sync-versions.mjs`

Usage:

```bash
npm run sync:version -- 1.6.14
```

This updates the `version` field in all workspace `package.json` files:

- `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`

## Release checklist

Before releasing:

- [ ] `npm install` (or `npm ci`)
- [ ] `npm run build:all` succeeds
- [ ] Update `CHANGELOG.md`:
    - Move entries from `[Unreleased]` into a new version section
    - Add the release date
- [ ] Sync versions across all workspaces:
    - `npm run sync:version -- <version>`
- [ ] Ensure license and docs are up to date (`README.md`, `LICENSE`)

## How to cut a release

### 1) Prepare the changelog

Update `CHANGELOG.md`:

- Move entries from `[Unreleased]` into a new version section
- Add the release date
- Keep `[Unreleased]` with empty placeholders for the next cycle

### 2) Sync versions

Pick your version (SemVer):

```bash
npm run sync:version -- 1.6.14
```

Commit the version changes:

```bash
git add package.json core/package.json electron/package.json ui/angular/package.json
git commit -m "chore(release): bump version to 1.6.14"
```

### 3) Tag the release

```bash
git tag v1.6.14
```

### 4) Push commit + tag

```bash
git push --follow-tags
```

### 5) Create the GitHub Release

On GitHub:

- Go to **Releases** → **Draft a new release**
- Select the tag (e.g. `v1.6.14`)
- Copy the notes from `CHANGELOG.md` for that version
- If the app is not stable yet, mark the release as **Pre-release**
- Publish the release

## Notes

- This project is licensed under **GPL-3.0-only** (see `LICENSE`).
- CI builds on pushes to `main` and on pull requests (GitHub Actions).
