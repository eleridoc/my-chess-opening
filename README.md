# My Chess Opening [![CI](https://github.com/eleridoc/my-chess-opening/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/eleridoc/my-chess-opening/actions/workflows/ci.yml) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/eleridoc/my-chess-opening?display_name=tag&sort=semver&label=release&cacheSeconds=300&v=1)](https://github.com/eleridoc/my-chess-opening/releases/latest) [![Discussions](https://img.shields.io/github/discussions/eleridoc/my-chess-opening)](https://github.com/eleridoc/my-chess-opening/discussions)

My Chess Opening is a desktop application to import, store, and explore your chess games with a clean UI and useful metadata such as accounts, imports, openings, ECO information, logs, and position exploration tools.

> Screenshots will be added later.

## Key features

- Import games from multiple chess platforms, including Chess.com and Lichess
- Live import progress and per-account results
- Local games database powered by Prisma + SQLite
- Explorer UI to navigate games and openings
- ECO dataset-based opening enrichment
- Database-powered "My next moves" statistics
- Export filtered games as PGN
- Export the current Explorer position as FEN, PGN, or PNG
- Dark and light theme support
- Linux packages: AppImage and Debian package (`.deb`)
- Windows packages: NSIS installer and portable executable

## Tech stack

- **Electron** for the desktop shell
- **Angular** + **Angular Material** for the UI
- **TypeScript** for core and application code
- **Prisma** + **SQLite** for the local database

## Repository structure

This is a multi-workspace repository:

- `core/` — shared types and core logic
- `electron/` — Electron main/preload process, IPC, DB access, and packaging runtime
- `ui/angular/` — Angular frontend

## Install on Windows

Download the latest release from the GitHub Releases page.

### Installer

Download and run:

```txt
my-chess-opening-<version>-setup-x64.exe
```

The installer adds My Chess Opening to the current Windows user account.

It may also create:

- a Start Menu shortcut
- a Desktop shortcut

### Portable executable

Download and run:

```txt
my-chess-opening-<version>-portable-x64.exe
```

The portable executable does not require installation.

It still uses the standard application data directory for user data, so your database and settings are kept between launches.

### Windows security warning

Current Windows builds are not code-signed.

Because of this, Windows may show a SmartScreen or "Unknown publisher" warning when starting the installer or portable executable.

This is expected for unsigned early releases.

### Windows user data

Windows builds store user data under:

```txt
%APPDATA%\my-chess-opening
```

This usually resolves to:

```txt
C:\Users\<user>\AppData\Roaming\my-chess-opening
```

The local SQLite database is stored under:

```txt
%APPDATA%\my-chess-opening\data\my-chess-opening.sqlite
```

Logs are stored under:

```txt
%APPDATA%\my-chess-opening\logs
```

Uninstalling the app does not remove user data automatically.

To fully remove local production data manually, delete:

```txt
%APPDATA%\my-chess-opening
```

## Install on Linux

Download the latest release from the GitHub Releases page.

### AppImage

The AppImage is the portable Linux build. It can be run without installing the app:

```bash
chmod +x my-chess-opening-<version>-x86_64.AppImage
./my-chess-opening-<version>-x86_64.AppImage
```

This format is intended to work on most modern x86_64 Linux desktop distributions, provided AppImage/FUSE support is available.

### Debian / Ubuntu / Linux Mint

The `.deb` package is recommended for Debian-based distributions such as Debian, Ubuntu, Linux Mint, Pop!\_OS, and Zorin OS.

Install it with:

```bash
sudo apt install ./my-chess-opening-<version>-amd64.deb
```

Run it from the terminal:

```bash
my-chess-opening
```

Uninstall it with:

```bash
sudo apt remove my-chess-opening
```

### Linux user data

Packaged Linux builds store user data under:

```txt
~/.config/my-chess-opening
```

The local SQLite database is stored under:

```txt
~/.config/my-chess-opening/data/my-chess-opening.sqlite
```

Logs are stored under:

```txt
~/.config/my-chess-opening/logs
```

Removing the AppImage or uninstalling the `.deb` does not remove user data automatically.

To remove local production data manually:

```bash
rm -rf ~/.config/my-chess-opening
```

## Verify release checksums

Release artifacts include SHA-256 checksum files.

To verify all downloaded artifacts from the release folder:

```bash
sha256sum -c SHA256SUMS
```

On Windows, you can also use PowerShell to check one file manually:

```powershell
Get-FileHash .\my-chess-opening-<version>-setup-x64.exe -Algorithm SHA256
```

Then compare the output with the corresponding `.sha256` file.

## Getting started for development

### Prerequisites

- Node.js
- npm
- Git

### Install dependencies

```bash
npm install
```

### Build everything

Build all workspaces in the correct order:

```bash
npm run build:all
```

### Run the UI

```bash
npm run dev:ui:angular
```

### Run the desktop app

In another terminal:

```bash
npm run dev:electron
```

### Preview production renderer locally

This builds the app in production mode and starts Electron with the local packaged renderer protocol:

```bash
npm run preview:prod
```

## Useful commands

### Import development helpers

Run Electron and limit the import to 10 games per account:

```bash
MCO_IMPORT_DEV_MAX_GAMES_PER_ACCOUNT=10 npm run build:all:run:electron
```

Enable detailed ECO logs:

```bash
MCO_ECO_DEBUG=1 npm run build:all:run:electron
```

### ECO dataset

Regenerate `lichess-chess-openings.json`, the ECO dataset used for enrichment:

```bash
npm run eco:update
```

### Prisma database commands

Create a migration, generate Prisma Client, then open Prisma Studio:

```bash
npm run prisma:migrate:open -- --name your_migration_name
```

Create a migration only:

```bash
npm run prisma:migrate -- --name your_migration_name
```

Reset and migrate DB from the Electron workspace:

```bash
npm run prisma:reset
```

Generate Prisma Client:

```bash
npm run prisma:generate
```

Open Prisma Studio:

```bash
npm run prisma:studio
```

### Development and maintenance

Generate app icons from the source logo:

```bash
chmod +x tools/generate-icons.sh
./tools/generate-icons.sh ui/angular/public/app-logo.png
```

Generate a new Angular page component:

```bash
npx ng g c dashboard-page --path src/app/pages/dashboard --flat --standalone --skip-tests --type=component
```

## Production build and packaging

Build production artifacts:

```bash
npm run build:prod
```

Generate Linux packages locally:

```bash
npm run package:linux
```

Generate Windows packages locally:

```bash
npm run package:windows
```

On Linux, local Windows packaging may require Wine depending on the target and environment. The recommended release workflow builds Windows artifacts on a native `windows-latest` GitHub Actions runner.

Generated artifacts are written under:

```txt
release/
```

Expected Linux files include:

```txt
my-chess-opening-<version>-x86_64.AppImage
my-chess-opening-<version>-amd64.deb
```

Expected Windows files include:

```txt
my-chess-opening-<version>-setup-x64.exe
my-chess-opening-<version>-portable-x64.exe
```

Expected checksum files include:

```txt
*.sha256
SHA256SUMS
```

Verify generated checksums:

```bash
cd release
sha256sum -c SHA256SUMS
cd ..
```

## License

This project is licensed under **GPL-3.0-only**.
