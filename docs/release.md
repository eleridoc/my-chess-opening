# Release process

This repository uses **Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH`.

See https://semver.org/ for the full specification.

## Versioning strategy

The repository uses a **single global version** for the whole project:

- root `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`

All packages must stay on the same version to keep releases simple and consistent.

### When to bump versions

- **PATCH** (`x.y.Z`)
    - Bug fixes
    - Refactors with no behavior change
    - Documentation updates
    - Dependency updates with no user-visible impact

- **MINOR** (`x.Y.z`)
    - New features with user-visible value
    - Improvements that do not break existing behavior
    - Additive changes to public APIs or types
    - New packaged release capability

- **MAJOR** (`X.y.z`)
    - Breaking changes in behavior, data, or API contracts
    - Significant UX changes that alter existing workflows
    - Major database or schema changes requiring special upgrade steps

## Git tags

Releases are tagged using the format:

```txt
vMAJOR.MINOR.PATCH
```

Example:

```bash
git tag -a v1.11.13 -m "v1.11.13"
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
npm run sync:version -- 1.11.13
```

This updates:

- `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`
- `package-lock.json`

### Clean build outputs

```bash
npm run clean:dist
```

This removes generated build and package outputs such as:

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

Use this only when you want to reset the local development or production preview database.

### Generate release checksums

```bash
npm run checksums:release
```

This generates SHA-256 checksum files under:

```txt
release/
```

Expected generated files:

```txt
release/*.sha256
release/SHA256SUMS
```

## Runtime data locations

### Development and local production preview

When running the app from the repository, runtime data is stored under:

```txt
.runtime/user-data
```

The local SQLite database is stored under:

```txt
.runtime/user-data/data/my-chess-opening.sqlite
```

### Packaged Linux app

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

### Packaged Windows app

When running the Windows installer or portable executable, runtime data is stored under:

```txt
%APPDATA%\my-chess-opening
```

This usually resolves to:

```txt
C:\Users\<user>\AppData\Roaming\my-chess-opening
```

The production SQLite database is stored under:

```txt
%APPDATA%\my-chess-opening\data\my-chess-opening.sqlite
```

Logs are stored under:

```txt
%APPDATA%\my-chess-opening\logs
```

Uninstalling the app does **not** remove user data automatically.

To remove local production test data manually, delete:

```txt
%APPDATA%\my-chess-opening
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

This runs a full production build, generates Linux artifacts, then generates SHA-256 checksums.

Generated files are written under:

```txt
release/
```

Expected output examples:

```txt
release/my-chess-opening-<version>-x86_64.AppImage
release/my-chess-opening-<version>-x86_64.AppImage.sha256
release/my-chess-opening-<version>-amd64.deb
release/my-chess-opening-<version>-amd64.deb.sha256
release/SHA256SUMS
```

### Package Linux without rebuilding

```bash
npm run package:linux:compiled
```

Use this only after a successful production build.

This command also regenerates SHA-256 checksums.

## Windows packaging

Windows packages are generated with `electron-builder`.

Supported targets:

- NSIS installer
- Portable executable

### Build Windows packages locally

```bash
npm run package:windows
```

Expected output examples:

```txt
release/my-chess-opening-<version>-setup-x64.exe
release/my-chess-opening-<version>-setup-x64.exe.sha256
release/my-chess-opening-<version>-portable-x64.exe
release/my-chess-opening-<version>-portable-x64.exe.sha256
release/SHA256SUMS
```

### Package Windows without rebuilding

```bash
npm run package:windows:compiled
```

Use this only after a successful production build.

This command also regenerates SHA-256 checksums.

### Building Windows packages from Linux

When building Windows artifacts locally from Linux, `electron-builder` may require Wine.

On Linux Mint / Ubuntu-based distributions, Wine can usually be installed with:

```bash
sudo apt install wine
```

However, the recommended release workflow is to build Windows artifacts on a native GitHub Actions Windows runner:

```txt
windows-latest
```

This avoids Wine-related issues and is closer to the real target environment.

## Artifact types

### Linux AppImage

The AppImage is a portable Linux package.

It can be run without installation:

```bash
chmod +x release/my-chess-opening-<version>-x86_64.AppImage
./release/my-chess-opening-<version>-x86_64.AppImage
```

This format is intended to work on most modern x86_64 Linux desktop distributions, provided AppImage/FUSE support is available.

### Linux Debian package

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

### Windows NSIS installer

The NSIS installer is the recommended Windows package for normal users.

Expected file:

```txt
my-chess-opening-<version>-setup-x64.exe
```

It installs the app for the current user and can create shortcuts.

Current installer behavior:

- per-user installation
- user can choose the installation directory
- Start Menu shortcut enabled
- Desktop shortcut enabled
- user data is not deleted on uninstall

### Windows portable executable

The portable executable can be run without installation.

Expected file:

```txt
my-chess-opening-<version>-portable-x64.exe
```

It still uses the standard Electron user data directory:

```txt
%APPDATA%\my-chess-opening
```

This means user data persists between launches.

### Windows SmartScreen warning

Current Windows builds are not code-signed.

Because of this, Windows may show a SmartScreen or "Unknown publisher" warning.

This is expected for unsigned early releases.

Code signing is not part of the current release process.

## Checksums

Release artifacts include SHA-256 checksum files.

### Verify all release artifacts on Linux

From the repository root:

```bash
cd release
sha256sum -c SHA256SUMS
cd ..
```

Expected result example:

```txt
my-chess-opening-<version>-amd64.deb: OK
my-chess-opening-<version>-x86_64.AppImage: OK
my-chess-opening-<version>-setup-x64.exe: OK
my-chess-opening-<version>-portable-x64.exe: OK
```

### Verify one artifact on Linux

Example:

```bash
cd release
sha256sum -c my-chess-opening-<version>-amd64.deb.sha256
cd ..
```

### Verify one artifact on Windows

Use PowerShell:

```powershell
Get-FileHash .\my-chess-opening-<version>-setup-x64.exe -Algorithm SHA256
```

Then compare the output with:

```txt
my-chess-opening-<version>-setup-x64.exe.sha256
```

## Production smoke test checklist

Before publishing a stable release, validate both Linux and Windows packages.

## 1. Build artifacts

- [ ] Run `npm ci`
- [ ] Run `npm run build:prod`
- [ ] Run `npm run package:linux`
- [ ] Confirm the AppImage exists in `release/`
- [ ] Confirm the `.deb` exists in `release/`
- [ ] Run `npm run package:windows`
- [ ] Confirm the Windows installer exists in `release/`
- [ ] Confirm the Windows portable executable exists in `release/`
- [ ] Confirm `.sha256` files exist in `release/`
- [ ] Confirm `SHA256SUMS` exists in `release/`
- [ ] Run `(cd release && sha256sum -c SHA256SUMS)`

## 2. Linux AppImage smoke test

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

## 3. Linux Debian package smoke test

- [ ] Install the `.deb`:

```bash
sudo apt install ./release/my-chess-opening-<version>-amd64.deb
```

- [ ] Start the app from the terminal:

```bash
my-chess-opening
```

- [ ] Confirm the app starts without JavaScript errors
- [ ] Confirm the app uses the production data directory:

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

## 4. Windows portable smoke test

- [ ] Download or copy the portable executable:

```txt
my-chess-opening-<version>-portable-x64.exe
```

- [ ] Run the portable executable
- [ ] Confirm the app starts without JavaScript errors
- [ ] Confirm the SQLite database is created under:

```txt
%APPDATA%\my-chess-opening\data
```

- [ ] Confirm logs are created under:

```txt
%APPDATA%\my-chess-opening\logs
```

- [ ] Close and reopen the app
- [ ] Confirm user data persists after restart

## 5. Windows installer smoke test

- [ ] Download or copy the installer:

```txt
my-chess-opening-<version>-setup-x64.exe
```

- [ ] Run the installer
- [ ] Confirm Windows may show an unsigned publisher warning
- [ ] Complete the installation
- [ ] Launch the app from the installer finish screen if available
- [ ] Launch the app from the Start Menu
- [ ] Launch the app from the Desktop shortcut if created
- [ ] Confirm the app starts without JavaScript errors
- [ ] Confirm user data is stored under:

```txt
%APPDATA%\my-chess-opening
```

- [ ] Close and reopen the app
- [ ] Confirm user data persists after restart
- [ ] Uninstall the app from Windows settings
- [ ] Confirm uninstalling the app does not remove user data automatically

## 6. Core app smoke test

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
- [ ] Import from a supported provider works
- [ ] Games page loads
- [ ] Explorer page loads
- [ ] Board renders correctly
- [ ] My next moves panel loads without crashing
- [ ] My next moves arrows render correctly
- [ ] Export page loads
- [ ] PGN export works
- [ ] Position export dialog opens
- [ ] Copy FEN works
- [ ] Copy PGN works
- [ ] Export PNG works
- [ ] App can be closed and reopened
- [ ] Data persists after restart

## 7. Production data reset after tests

### Linux

```bash
rm -rf ~/.config/my-chess-opening
```

### Windows PowerShell

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\my-chess-opening"
```

## Release checklist

Before releasing:

- [ ] `npm ci` succeeds
- [ ] `npm run build:prod` succeeds
- [ ] `npm run package:linux` succeeds
- [ ] `npm run package:windows` succeeds, if testing locally
- [ ] `sha256sum -c release/SHA256SUMS` succeeds
- [ ] Linux AppImage smoke test passes
- [ ] Linux `.deb` smoke test passes
- [ ] Windows portable smoke test passes
- [ ] Windows installer smoke test passes
- [ ] Core app smoke test passes
- [ ] Update `CHANGELOG.md`
- [ ] Move entries from `[Unreleased]` into a new version section
- [ ] Add the release date
- [ ] Sync versions across all workspaces
- [ ] Ensure `README.md`, `LICENSE`, and docs are up to date
- [ ] Ensure no generated artifact is committed
- [ ] Ensure `release/` remains ignored by Git
- [ ] Ensure `.runtime/` remains ignored by Git
- [ ] Ensure `RELEASE_NOTES.md` remains ignored by Git

## How to cut a release

### 1. Prepare the changelog

Update `CHANGELOG.md`:

- Move entries from `[Unreleased]` into a new version section
- Add the release date
- Keep `[Unreleased]` with empty placeholders for the next cycle

Example:

```md
## [1.11.13] - 2026-04-25

### Added

- Added Windows installation and runtime documentation.

### Changed

- Updated release documentation for multi-platform Linux and Windows releases.

### Fixed

- (placeholder)
```

### 2. Sync versions

Pick the release version:

```bash
npm run sync:version -- 1.11.13
```

### 3. Build and test locally

Run:

```bash
npm ci
npm run build:prod
npm run package:linux
cd release
sha256sum -c SHA256SUMS
cd ..
```

If testing Windows packaging locally from Linux, Wine may be required:

```bash
npm run package:windows
```

For the official GitHub release workflow, Windows artifacts should be generated on `windows-latest`.

### 4. Commit the release preparation

```bash
git add package.json package-lock.json core/package.json electron/package.json ui/angular/package.json CHANGELOG.md README.md docs/release.md
git commit -m "docs(release): add Windows installation documentation"
```

Adjust the version in the commit message if needed.

### 5. Create an annotated tag

```bash
git tag -a v1.11.13 -m "v1.11.13"
```

### 6. Push commit and tag

```bash
git push
git push origin v1.11.13
```

## GitHub Release

GitHub Releases are created automatically by the `Release` workflow.

The workflow runs when a release tag is pushed:

```bash
git tag -a v1.11.13 -m "v1.11.13"
git push origin v1.11.13
```

The expected multi-platform workflow should:

- install dependencies with `npm ci`
- validate that the Git tag matches the root `package.json` version
- build production artifacts
- package Linux AppImage and `.deb` artifacts on `ubuntu-latest`
- package Windows NSIS installer and portable executable on `windows-latest`
- collect all generated package artifacts
- generate combined SHA-256 checksums
- extract release notes from `CHANGELOG.md`
- create a GitHub Release
- upload all generated artifacts and checksum files

Expected release files:

```txt
my-chess-opening-<version>-x86_64.AppImage
my-chess-opening-<version>-amd64.deb
my-chess-opening-<version>-setup-x64.exe
my-chess-opening-<version>-portable-x64.exe
*.sha256
SHA256SUMS
```

The release workflow expects the changelog to contain a section matching the tag version, for example:

```md
## [1.11.13] - 2026-04-25
```

If the changelog section is missing, the workflow may publish a release with fallback notes, but this should be avoided for stable releases.

## Troubleshooting GitHub Releases

### The workflow did not start

Check that the tag was pushed:

```bash
git push origin v1.11.13
```

Check that the tag matches the workflow pattern:

```yml
v*.*.*
```

### The validation job failed

Check that the tag version matches the root `package.json` version.

Example:

```txt
tag: v1.11.13
package.json: 1.11.13
```

### The release exists but has no artifacts

Check the `publish` job.

Common causes:

- build jobs failed before uploading artifacts
- artifact names do not match the download pattern
- release upload file patterns do not match generated filenames
- `release/` is empty in the publish job
- `fail_on_unmatched_files` stopped the release upload

### Linux artifacts are missing

Check the Linux build job output.

Expected files:

```txt
release/*.AppImage
release/*.deb
```

### Windows artifacts are missing

Check the Windows build job output.

Expected files:

```txt
release/*.exe
```

The Windows job should run on:

```txt
windows-latest
```

It should not require Wine.

### Checksums are missing or incomplete

Checksums should be generated only after all Linux and Windows artifacts have been downloaded into the final `release/` folder.

The final publish job should generate:

```txt
release/*.sha256
release/SHA256SUMS
```

## Notes

- This project is licensed under **GPL-3.0-only**.
- CI builds production artifacts on pushes to `main` and on pull requests.
- Linux packaging currently targets x86_64.
- Windows packaging currently targets x64.
- Auto-update is not part of the current release process.
- Windows code signing is not part of the current release process.
