# Quick release checklist

This is the short process to use when publishing a stable release.

Replace `1.11.13` with the real version.

## 1. Update the version

```bash
npm run sync:version -- 1.11.13
```

Check modified files:

```bash
git diff package.json core/package.json electron/package.json ui/angular/package.json package-lock.json
```

## 2. Update the changelog

In `CHANGELOG.md`:

- move entries from `[Unreleased]` to a versioned section;
- add the release date;
- keep a clean `[Unreleased]` block for the next cycle.

Example:

```md
## [1.11.13] - 2026-04-25

### Added

- Added Windows installation documentation.

### Changed

- Updated release documentation for multi-platform releases.

### Fixed

- Fixed Discord release announcements.
```

## 3. Check release notes locally

This is not mandatory because GitHub Actions also runs it, but it prevents tagging with a malformed changelog.

```bash
node tools/extract-release-notes.mjs v1.11.13
cat RELEASE_NOTES.md
rm RELEASE_NOTES.md
```

## 4. Minimum local build before commit

```bash
npm ci
npm run build:prod
npm run package:linux
cd release
sha256sum -c SHA256SUMS
cd ..
```

## 5. Commit release preparation

```bash
git status
git add README.md docs/release.md docs/release CHANGELOG.md package.json package-lock.json core/package.json electron/package.json ui/angular/package.json
git commit -m "chore(release): prepare v1.11.13"
```

Adjust the `git add` command to the files that were really changed.

## 6. Push `main`

```bash
git push origin main
```

You can use `git push` if your local branch tracks `origin/main`.

## 7. Wait for CI

In GitHub Actions, make sure the `main` CI workflow succeeds before creating the tag.

## 8. Create and push the tag

```bash
git tag -a v1.11.13 -m "v1.11.13"
git push origin v1.11.13
```

## 9. Check the Release workflow

In GitHub Actions, check:

```txt
Release
  validate
  build-linux
  build-windows
  publish
```

All jobs must pass.

## 10. Check the GitHub Release

The release must contain:

```txt
my-chess-opening-1.11.13-x86_64.AppImage
my-chess-opening-1.11.13-amd64.deb
my-chess-opening-1.11.13-setup-x64.exe
my-chess-opening-1.11.13-portable-x64.exe
*.sha256
SHA256SUMS
```

## 11. Check Discord

The release announcement must be posted in the Discord channel configured by the webhook.

## 12. Smoke test published files

Download files from GitHub Releases, then check:

- Linux AppImage;
- Linux `.deb`;
- Windows portable executable;
- Windows installer;
- checksums;
- app startup;
- database creation;
- close / reopen;
- import;
- explorer;
- PGN export;
- position export.
