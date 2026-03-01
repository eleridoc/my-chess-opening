# My Chess Opening [![CI](https://github.com/eleridoc/my-chess-opening/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/eleridoc/my-chess-opening/actions/workflows/ci.yml) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/eleridoc/my-chess-opening)](https://github.com/eleridoc/my-chess-opening/releases) [![Discussions](https://img.shields.io/github/discussions/eleridoc/my-chess-opening)](https://github.com/eleridoc/my-chess-opening/discussions)

My Chess Opening is a desktop application to import, store, and explore your chess games with a clean UI and useful metadata (accounts, imports, openings/ECO, logs, etc.).

> Screenshots will be added later.

## Key features

- Import games from multiple chess platforms (e.g. Chess.com, Lichess)
- Live import progress and per-account results
- Games database powered by Prisma + SQLite
- Explorer UI to navigate games and openings (ECO dataset-based enrichment)
- Dark/Light theme support

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
npm run build:watch:ui:angular
```

### Run the desktop app (Electron)

After building everything:

```bash
npm run build:all:run:electron
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

## Troubleshooting

- If Electron runs but the UI looks outdated, rebuild everything:
    ```bash
    npm run build:all
    ```
- If Prisma changes are not reflected, regenerate the client:
    ```bash
    npm run prisma:generate
    ```

## Community

- Questions and help: use GitHub Discussions (Q&A).
- Bugs and feature requests: use GitHub Issues (templates available).

## License

This project is licensed under the GNU General Public License v3.0 (**GPL-3.0-only**). See the `LICENSE` file for details.
