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
    - New features with user-visible value
    - Improvements that do not break existing behavior
    - Additive changes to public APIs/types
    - New packaged release capability

- **MAJOR** (`X.y.z`)
    - Breaking changes in behavior, data, or API contracts
    - Significant UX changes that alter existing workflows
    - Major database/schema changes requiring special upgrade steps

## Git tags

Releases are tagged using the format:

- `vMAJOR.MINOR.PATCH`

Example:

```bash
git tag -a v1.11.0 -m "v1.11.0"
```

Use **annotated tags** for releases.

## Tools

### Sync versions across workspaces

To keep a single global version, use:

```bash
npm run sync:version -- <version>
```

Example:

```bash
npm run sync:version -- 1.11.0
```

This updates:

- `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`

### Clean build outputs

```bash
npm run clean:dist
```

This removes generated build/package outputs such as:

- `core/dist`
- `electron/dist`
- `ui/angular/dist`
- `release`

### Clean local runtime data

```bash
npm run clean:runtime
```

This removes the local development runtime directory:

```txt
.runtime/
```

Use this only when you want to reset the local development/preview database.

## Runtime data locations

### Development / local production preview

When running the app from the repository, runtime data is stored under:

```txt
.runtime/user-data
```

The local SQLite database is stored under:

```txt
.runtime/user-data/data/my-chess-opening.sqlite
```

### Packaged production app

When running the AppImage or the installed `.deb`, runtime data is stored under:

```txt
~/.config/my-chess-opening
```

The production SQLite database is stored under:

```txt
~/.config/my-chess-opening/data/my-chess-opening.sqlite
```

Logs are stored under:

```txt
~/.config/my-chess-opening/logs
```

Removing the AppImage or uninstalling the `.deb` does **not** remove user data automatically.

To remove local production test data manually:

```bash
rm -rf ~/.config/my-chess-opening
```

## Build commands

### Development build

```bash
npm run build:all
```

### Production build

```bash
npm run build:prod
```

This runs a clean production build for:

- `core`
- `electron`
- `ui/angular`

### Production preview

```bash
npm run preview:prod
```

This builds the app in production mode and starts Electron using the local renderer protocol.

Use this to validate production behavior before packaging.

### Production preview without rebuilding

```bash
npm run preview:prod:compiled
```

Use this only after a successful `npm run build:prod`.

## Linux packaging

Linux packages are generated with `electron-builder`.

Supported local targets:

- AppImage
- Debian package (`.deb`)

### Build Linux packages

```bash
npm run package:linux
```

This runs a full production build and then generates Linux artifacts under:

```txt
release/
```

Expected output examples:

```txt
release/my-chess-opening-<version>-x86_64.AppImage
release/my-chess-opening-<version>-amd64.deb
```

### Package without rebuilding

```bash
npm run package:linux:compiled
```

Use this only after a successful production build.

## Linux artifact types

### AppImage

The AppImage is a portable Linux package.

It can be run without installation:

```bash
chmod +x release/my-chess-opening-<version>-x86_64.AppImage
./release/my-chess-opening-<version>-x86_64.AppImage
```

This format is intended to work on most modern x86_64 Linux desktop distributions, provided AppImage/FUSE support is available.

### Debian package

The `.deb` package is intended for Debian-based distributions such as:

- Debian
- Ubuntu
- Linux Mint
- Pop!\_OS
- Zorin OS

Install it with:

```bash
sudo apt install ./release/my-chess-opening-<version>-amd64.deb
```

Run it from the terminal:

```bash
my-chess-opening
```

Uninstall it with:

```bash
sudo apt remove my-chess-opening
```

## Production smoke test checklist

Before publishing a release, validate both the AppImage and the `.deb`.

### 1. Build artifacts

- [ ] Run `npm ci`
- [ ] Run `npm run build:prod`
- [ ] Run `npm run package:linux`
- [ ] Confirm the AppImage exists in `release/`
- [ ] Confirm the `.deb` exists in `release/`

### 2. AppImage smoke test

- [ ] Make the AppImage executable:

```bash
chmod +x release/my-chess-opening-<version>-x86_64.AppImage
```

- [ ] Start the AppImage from the terminal:

```bash
./release/my-chess-opening-<version>-x86_64.AppImage
```

- [ ] Confirm the app starts without JavaScript errors
- [ ] Confirm runtime logs show production mode
- [ ] Confirm `userDataDir` points to `~/.config/my-chess-opening`
- [ ] Confirm the SQLite database is created under `~/.config/my-chess-opening/data`
- [ ] Confirm Prisma migrations apply successfully on first launch
- [ ] Close and reopen the AppImage
- [ ] Confirm migrations are not re-applied on second launch

### 3. Debian package smoke test

- [ ] Install the `.deb`:

```bash
sudo apt install ./release/my-chess-opening-<version>-amd64.deb
```

- [ ] Start the app from the terminal:

```bash
my-chess-opening
```

- [ ] Confirm the app starts without JavaScript errors
- [ ] Confirm the app uses the same production data directory:

```txt
~/.config/my-chess-opening
```

- [ ] Confirm the desktop/menu entry is available
- [ ] Confirm the icon displays correctly if supported by the desktop environment
- [ ] Uninstall the package:

```bash
sudo apt remove my-chess-opening
```

- [ ] Confirm uninstalling the package does not remove user data automatically

### 4. Core app smoke test

Validate the main user workflows:

- [ ] App starts correctly
- [ ] Theme switch works in production mode
- [ ] Navigation works
- [ ] External links open in the system browser
- [ ] Global notifications work
- [ ] Confirm dialogs work
- [ ] Loading states display correctly
- [ ] Accounts page loads
- [ ] A chess account can be added or existing account data can be read
- [ ] Import page loads
- [ ] Games page loads
- [ ] Explorer page loads
- [ ] Board renders correctly
- [ ] My next moves panel loads without crashing
- [ ] Export page loads
- [ ] PGN export works
- [ ] Position export dialog opens
- [ ] Copy FEN works
- [ ] Copy PGN works
- [ ] Export PNG works
- [ ] App can be closed and reopened
- [ ] Data persists after restart

### 5. Production data reset after tests

When testing is complete, remove production test data if needed:

```bash
rm -rf ~/.config/my-chess-opening
```

## Release checklist

Before releasing:

- [ ] `npm ci` succeeds
- [ ] `npm run build:prod` succeeds
- [ ] `npm run package:linux` succeeds
- [ ] AppImage smoke test passes
- [ ] `.deb` smoke test passes
- [ ] Core app smoke test passes
- [ ] Update `CHANGELOG.md`
- [ ] Move entries from `[Unreleased]` into a new version section
- [ ] Add the release date
- [ ] Sync versions across all workspaces
- [ ] Ensure `README.md`, `LICENSE`, and docs are up to date
- [ ] Ensure no generated artifact is committed
- [ ] Ensure `release/` remains ignored by Git
- [ ] Ensure `.runtime/` remains ignored by Git

## How to cut a release

### 1. Prepare the changelog

Update `CHANGELOG.md`:

- Move entries from `[Unreleased]` into a new version section
- Add the release date
- Keep `[Unreleased]` with empty placeholders for the next cycle

### 2. Sync versions

Pick the release version:

```bash
npm run sync:version -- 1.11.0
```

### 3. Build and test

Run:

```bash
npm ci
npm run build:prod
npm run package:linux
```

Then execute the production smoke test checklist.

### 4. Commit the release preparation

```bash
git add package.json package-lock.json core/package.json electron/package.json ui/angular/package.json CHANGELOG.md docs/release.md
git commit -m "chore(release): prepare v1.11.0"
```

Adjust the version in the commit message.

### 5. Create an annotated tag

```bash
git tag -a v1.11.0 -m "v1.11.0"
```

### 6. Push commit and tag

```bash
git push
git push origin v1.11.0
```

## GitHub Release

Until the automated release workflow is added, create the GitHub Release manually:

- Go to **GitHub → Releases**
- Select **Draft a new release**
- Select the tag, for example `v1.11.0`
- Copy the notes from `CHANGELOG.md`
- Upload the generated Linux artifacts from `release/`:
    - AppImage
    - `.deb`
- Publish the release

## Notes

- This project is licensed under **GPL-3.0-only**.
- CI builds production artifacts on pushes to `main` and on pull requests.
- Linux packaging currently targets x86_64.
- Auto-update is not part of the current release process.
