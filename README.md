# My Chess Opening [![CI](https://github.com/eleridoc/my-chess-opening/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/eleridoc/my-chess-opening/actions/workflows/ci.yml) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/eleridoc/my-chess-opening?display_name=tag&sort=semver&label=release&cacheSeconds=300&v=1)](https://github.com/eleridoc/my-chess-opening/releases/latest) [![Discussions](https://img.shields.io/github/discussions/eleridoc/my-chess-opening)](https://github.com/eleridoc/my-chess-opening/discussions)

My Chess Opening is a desktop application to import, store, and explore your chess games with a clean UI and useful metadata (accounts, imports, openings/ECO, logs, etc.).

> Screenshots will be added later.

## Key features

- Import games from multiple chess platforms (e.g. Chess.com, Lichess)
- Live import progress and per-account results
- Games database powered by Prisma + SQLite
- Explorer UI to navigate games and openings (ECO dataset-based enrichment)
- Dark/Light theme support
- Linux production packages: AppImage and Debian package (`.deb`)

## Tech stack

- **Electron** (desktop shell)
- **Angular** + **Angular Material** (UI)
- **TypeScript** (core + app code)
- **Prisma** + **SQLite** (local database)

## Repository structure

This is a multi-workspace repository:

- `core/` — shared types and core logic
- `electron/` — Electron main/preload + IPC + DB access (Prisma)
- `ui/angular/` — Angular frontend

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

### User data

Packaged Linux builds store user data under:

```txt
~/.config/my-chess-opening
```

The local SQLite database is stored under:

```txt
~/.config/my-chess-opening/data/my-chess-opening.sqlite
```

Removing the AppImage or uninstalling the `.deb` does not remove user data automatically.

To remove local production data manually:

```bash
rm -rf ~/.config/my-chess-opening
```

### Verify release checksums

Release artifacts include SHA-256 checksum files.

To verify all downloaded artifacts from the release folder:

```bash
sha256sum -c SHA256SUMS
```

## Getting started (development)

### Prerequisites

- Node.js + npm
- (Optional) Linux/macOS shell tools if you use helper scripts

### Install dependencies

```bash
npm install
```

### Build everything (recommended)

Build all workspaces in the correct order:

```bash
npm run build:all
```

### Run the UI (Angular dev server)

```bash
npm run dev:ui:angular
```

### Run the desktop app (Electron)

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

### Import (development helpers)

Run Electron and limit the import to 10 games per account:

```bash
MCO_IMPORT_DEV_MAX_GAMES_PER_ACCOUNT=10 npm run build:all:run:electron
```

Enable detailed ECO logs:

```bash
MCO_ECO_DEBUG=1 npm run build:all:run:electron
```

### ECO dataset

Regenerate `lichess-chess-openings.json` (ECO dataset used for enrichment):

```bash
npm run eco:update
```

### Prisma (database)

Create a migration, generate Prisma Client, then open Prisma Studio:

```bash
npm run prisma:migrate:open -- --name your_migration_name
```

Create a migration only:

```bash
npm run prisma:migrate -- --name your_migration_name
```

Reset and migrate DB (electron workspace):

```bash
npm run prisma:reset
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Open Prisma Studio:

```bash
npm run prisma:studio
```

### Development / maintenance

Generate app icons from the source logo:

```bash
chmod +x tools/generate-icons.sh
./tools/generate-icons.sh ui/angular/public/app-logo.png
```

Full DB reset (manual steps, electron workspace):

```bash
cd electron
rm -rf prisma/migrations
rm -f dev.db
rm -f prisma/dev.db
npx prisma migrate dev --name init
npx prisma generate
npx prisma studio
```

Generate a new Angular page component (example):

```bash
npx ng g c dashboard-page --path src/app/pages/dashboard --flat --standalone --skip-tests --type=component
```

### Production build and packaging

Build production artifacts:

```bash
npm run build:prod
```

Generate Linux packages locally:

```bash
npm run package:linux
```

Generated artifacts are written under:

```txt
release/
```

Expected files include:

```txt
my-chess-opening-<version>-x86_64.AppImage
my-chess-opening-<version>-amd64.deb
SHA256SUMS
```

Verify generated checksums:

```bash
cd release
sha256sum -c SHA256SUMS
cd ..
```

## Troubleshooting

- If Electron runs but the UI looks outdated, rebuild everything:
    ```bash
    npm run build:all
    ```
- If Prisma changes are not reflected, regenerate the client:
    ```bash
    npm run prisma:generate
    ```

### Lichess API: empty export when using `rated` / `perfType` with `since`

In some cases, Lichess game export may return an **empty response** when `since` is combined with
`rated=true` and/or `perfType=...`, even though games exist after the `since` timestamp.

Symptoms:

- A request with `since` returns games
- Adding `rated=true` and/or `perfType=bullet,blitz,rapid` returns an empty body

Example:

- Works:
    - `https://lichess.org/api/games/user/<username>?max=300&moves=true&clocks=true&opening=true&pgnInJson=false&since=<since_ms>`

- May return empty:
    - `https://lichess.org/api/games/user/<username>?max=300&moves=true&clocks=true&opening=true&pgnInJson=false&rated=true&since=<since_ms>`
    - `https://lichess.org/api/games/user/<username>?max=300&moves=true&clocks=true&opening=true&pgnInJson=false&perfType=bullet,blitz,rapid&since=<since_ms>`

Workaround (for debugging / manual checks):

- Remove `rated` and `perfType` from the request, then filter results client-side (rated + speed). Will be done later.

## Community

- Discord (EN-first, FR welcome): https://discord.gg/WemAGmXQZR
- Questions / help (structured): GitHub Discussions (Q&A).
- Bug reports: GitHub Issues (Bug report template).
- Feature requests: GitHub Issues (Feature request template) or GitHub Discussions (Ideas).
- Please read the Code of Conduct before contributing: CODE_OF_CONDUCT.md

## License

This project is licensed under the GNU General Public License v3.0 (**GPL-3.0-only**). See the `LICENSE` file for details.
