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

## Release checklist

Before releasing:

- [ ] `npm install` (or `npm ci`)
- [ ] `npm run build:all` succeeds
- [ ] Update `CHANGELOG.md`:
    - Move entries from `[Unreleased]` into a new version section
    - Add the release date
- [ ] Ensure license and docs are up to date (`README.md`, `LICENSE`)

## Notes

- This project is licensed under **GPL-3.0-only** (see `LICENSE`).
- CI builds on pushes to `main` and on pull requests (GitHub Actions).
