# Changelog

All notable changes to this project will be documented in this file.

The format is based on **Keep a Changelog** (https://keepachangelog.com/en/1.0.0/),
and this project follows **Semantic Versioning** (https://semver.org/).

## [Unreleased]

### Added

- (placeholder)

### Changed

- (placeholder)

### Fixed

- (placeholder)

## [1.11.7] 2026-04-24

### Added

- Production renderer runtime for Electron with:
    - development mode loading the Angular dev server
    - production/local preview mode loading the Angular production build
    - custom `mco://renderer` protocol for serving the packaged Angular renderer
    - renderer build existence check before local production startup
- Local production preview command:
    - `npm run preview:prod`
    - `npm run preview:prod:compiled`
- Dedicated Angular production build command:
    - `build:ui:angular:prod`
    - `build:prod`
- Centralized runtime path management in Electron with:
    - development runtime directory
    - production user data directory
    - logs directory
    - database directory
    - renderer dist directory
    - assets directory
    - Prisma schema and migrations paths
- Runtime path diagnostics at startup.
- Dedicated development runtime folder:
    - `.runtime/user-data`
    - `.runtime/logs`
    - `.runtime/user-data/data`
- Production user data folder using a stable Linux-friendly path:
    - `~/.config/my-chess-opening`
- Runtime SQLite database path:
    - development/local preview: `.runtime/user-data/data/my-chess-opening.sqlite`
    - packaged production: `~/.config/my-chess-opening/data/my-chess-opening.sqlite`
- Lazy Prisma client singleton to ensure `DATABASE_URL` is configured before client creation.
- Runtime Prisma database URL configuration based on the centralized SQLite path.
- SQLite migration runner for packaged production usage.
- Automatic application of pending Prisma SQLite migrations at startup.
- Prisma disconnect handling on application shutdown.
- Cross-platform build helpers:
    - `tools/clean-dist.mjs`
    - `tools/clean-runtime.mjs`
- Cross-platform environment variable handling with `cross-env`.
- Linux packaging support with `electron-builder`.
- Linux AppImage generation.
- Linux Debian package generation.
- Electron Builder configuration with:
    - packaged Angular renderer resources
    - Electron assets resources
    - Prisma schema and migrations resources
    - Prisma client/runtime packaging
    - `my-chess-opening-core` runtime packaging
- GitHub Actions workflow for automated Linux releases on version tags.
- Automatic GitHub Release creation from tags matching `v*.*.*`.
- Release tag and package version validation in CI.
- Release notes extraction from `CHANGELOG.md`.
- SHA-256 checksum generation for Linux release artifacts.
- Aggregate `SHA256SUMS` file generation.
- Individual `.sha256` files for AppImage and `.deb` artifacts.
- Release documentation covering:
    - build commands
    - production preview
    - Linux packaging
    - AppImage usage
    - Debian package usage
    - runtime data locations
    - production smoke test checklist
    - checksum verification
    - automated GitHub release workflow

### Changed

- Electron startup now separates development and production renderer loading.
- Production renderer loading now uses the `mco://renderer` custom protocol instead of relying on the Angular dev server.
- Renderer navigation is restricted to the expected dev server or local production protocol.
- Content Security Policy now adapts to the active renderer mode.
- Angular production optimization was adjusted to avoid CSP-incompatible critical CSS inline handlers.
- Global CSS loading order was made more deterministic for production builds.
- Theme initialization was hardened so theme switching does not depend on `localStorage` availability.
- Local development data is now isolated under `.runtime/` instead of mixing with future packaged production data.
- Packaged app data now uses `~/.config/my-chess-opening` instead of Electron’s default `~/.config/My Chess Opening`.
- Prisma client creation is now lazy and centralized.
- `DATABASE_URL` is now configured at runtime from the Electron runtime database path.
- Production build scripts were clarified and separated from development scripts.
- CI now validates the production build instead of only the generic workspace build.
- Linux packaging scripts now generate checksums automatically.
- GitHub release workflow now uploads:
    - AppImage
    - `.deb`
    - individual `.sha256` files
    - `SHA256SUMS`
- Release documentation was expanded into a full production release process.

### Fixed

- Fixed production renderer startup depending on `localhost:4200`.
- Fixed production CSS not applying correctly because Angular generated CSP-incompatible inline stylesheet handlers.
- Fixed theme switch appearing to change classes without visually updating colors in production.
- Fixed local renderer fallback returning `index.html` for missing asset-like files.
- Fixed packaged AppImage startup failing with `Cannot find module 'my-chess-opening-core'`.
- Fixed packaged app database path using Electron’s default product-name folder with spaces.
- Fixed production SQLite database initialization by moving runtime data to a stable kebab-case directory.
- Fixed `.deb` packaging failure caused by missing maintainer/author email metadata.
- Fixed potential Prisma initialization order issues by preventing `PrismaClient` creation before `DATABASE_URL` is configured.
- Fixed release artifact integrity verification by adding SHA-256 checksum generation.

## [1.10(.7)]

### Added

- **Export current position** entrypoint in `board-controls`
- Dedicated position export dialog in the Explorer
- Current position export actions for:
    - **FEN**
    - **PGN**
    - **PNG**
- Core current-line PGN export builder for the active line up to the current cursor
- Dedicated `session.export.ts` module to keep Explorer session export logic split by concern
- Explorer facade support for retrieving the current export PGN
- Copy actions for:
    - **Copy FEN**
    - **Copy PGN**
- PNG export service based on the live rendered board
- Automatic PNG file naming based on the current position key

### Changed

- Added a dedicated export workflow to the Explorer instead of exposing raw export actions directly on the page
- Wired the export dialog with the real current FEN and current PGN from the active Explorer state
- Kept PGN export logic in `core` while keeping UI export actions in Angular
- Reworked the export dialog into a more compact layout
- Updated the dialog to show **FEN / PGN / PNG** sections side by side
- Aligned export actions on a single row so the full dialog remains visible when opened

### Fixed

- Fixed PNG export so it no longer relies on a single SVG layer from the board
- Composed the rendered board from multiple SVG layers for PNG export
- Embedded external SVG assets required by the board export pipeline
- Embedded missing local SVG fragment definitions so exported PNGs correctly preserve board visuals
- Improved PNG export fidelity for live board rendering, including overlays such as arrows and piece rendering

## [1.9(.14)]

### Added

- Dedicated **My next moves** feature in the Explorer based on imported database games
- Shared `my-next-moves` domain across `core`, preload, and Electron IPC
- Backend aggregation for the current position with:
    - most played next moves
    - move percentages
    - game counts
    - White / Draw / Black statistics
    - current position summary
- Position identity alignment using a **SHA-256 hash of normalized 4-field FEN**
- Dedicated Explorer panel for **My next moves** with:
    - automatic loading from the current position
    - loading / empty / error states
    - popup access to the shared game filter
- Next moves table with:
    - one row per move
    - fixed final row for the current position
    - internal scroll
    - hover / focus / keyboard selection support
- Move information popovers for each move row and for the `Current` row
- Direct move play from the **My next moves** list
- Board arrow integration through `cm-chessboard`
- Arrow display modes:
    - `off`
    - `3`
    - `5`
    - `all`
- Arrow hover highlight on row focus/hover
- Visual arrow weighting based on move popularity
- Custom arrow colors to better separate current and future data sources

### Changed

- Turned the Explorer lower-right section into a real **My next moves** product feature
- Aligned Explorer and import position matching around the same normalized position identity logic
- Automatically resolved `playedColor` for **My next moves**:
    - player color when a DB game is loaded
    - board bottom color in study mode
- Reworked the next moves UI from a multi-line layout into a denser table layout
- Replaced the former `Share` presentation with a cleaner percentage-first display
- Refined the `White / Draw / Black` column into a more compact integrated stats bar
- Replaced the inline arrow mode controls with a compact select control
- Reduced the visual size of several dense Explorer elements for better readability

### Fixed

- Kept DB move lookup consistent with imported positions by reusing the same normalized FEN hashing strategy
- Improved table scrolling behavior in the **My next moves** panel
- Improved row hover / selection feedback for move-to-board interactions
- Reduced visual clutter in dense Explorer sections such as the move stats and arrow controls

## [1.8(.7)] 2026-04-18

### Added

- Dedicated Export feature flow with:
    - explicit game filtering action
    - summary generation from the current export filter
    - PGN file generation and download from the last searched filter
- Shared IPC export domain in `core` with:
    - export summary contracts
    - PGN export file contracts
- Electron export IPC handlers for:
    - export summary computation
    - PGN file generation
- Angular `ExportService` for export-related IPC calls
- Export summary panel showing:
    - total games
    - wins / draws / losses
    - white / black games
    - bullet / blitz / rapid games
- Export page state handling for:
    - current live filter
    - last executed filter
    - stale summary detection
    - loading and reset states
- Optional unified player name field for PGN export
- Local storage persistence for the last unified player name used during export

### Changed

- Turned the Export page from a filter testbed into a real product feature
- Updated the Export workflow so summary generation happens only through an explicit action button
- Ensured PGN export always uses the last searched filter, even if the visible filter changes afterwards
- Reset the Export page state after a successful export without resetting the filter itself
- Restricted the Export filter context by removing:
    - rated mode
    - opponent rating range
    - rating difference range
- Improved Export page UX with clearer summary states, better action labels, and a dedicated clear result action
- Allowed exported PGNs to optionally replace account-specific player names with one unified player name

### Fixed

- Prevented hidden Export filter fields from being applied by re-enforcing the Export context rules in the backend
- Kept summary and export behavior consistent by using a canonical applied filter returned by the backend
- Normalized generated PGN exports with consistent line endings, spacing cleanup, and proper game separation
- Preserved original imported player names when no unified export name is provided

## [1.7(.13)] 2026-04-17

### Added

- Shared reusable game filter foundation in `core` with:
    - shared types
    - defaults
    - normalization helpers
    - period preset handling
    - query payload mapping
- Browser-safe `filters` entrypoint for Angular imports from `my-chess-opening-core`
- Shared Angular game filter storage service with per-context local storage persistence
- Shared Angular context configuration layer for reusable filter contexts
- Reusable standalone shared game filter component
- Popup mode support for the shared game filter via dedicated dialog component and service
- First real integration of the shared game filter on the Export page
- Export page debug preview for normalized filter output and mapped query payload

### Changed

- Reworked the filter into a shared reusable feature designed for Export, My next moves, and future screens
- Applied the same shared filter logic to both inline and popup modes
- Updated the Export page to use the new shared filter flow
- Replaced manual Apply behavior with automatic filter application on valid changes
- Kept Reset in both inline and popup modes, and kept Close in popup mode
- Aligned the popup filter visual style with the application dialog overlay styling

### Fixed

- Prevented hidden fields from being applied outside their active context
- Prevented invalid date and rating ranges from being applied
- Improved filter validation feedback and reset behavior
- Fixed Angular browser bundling issues caused by Node-only imports from the root core entrypoint
- Prevented duplicate filter emissions in auto-apply mode

## [1.6.17] - 2026-04-14

### Added

- feat(ui): show app version in about and help menu
- feat(ui): add main libraries section to about
- feat(ui): add creator section to about
- docs: document known Lichess export issue with rated/perfType filters
- feat(explorer): add move navigation shortcuts (wheel + arrow keys)

### Changed

- docs: refresh release badge
- chore(tools): sync version across packages + lockfile + ui constant

### Fixed

- chore(ui): polish about page layout
- chore(ui): clean up dashboard replace content by coming soon

## [1.6.16] - 2026-03-02

### Added

- Discord community entrypoints:
    - Repo docs now include a Discord invite link (EN-first, FR welcome).
    - UI Help menu includes a Discord entry and the About page exposes community/project links.
- CI: GitHub Release → Discord notification workflow (EN-first + FR line).

### Changed

- (none)

### Fixed

- (none)

## [1.6.15] - 2026-03-02

### Added

- GPLv3 license (`LICENSE`) and updated package metadata to `GPL-3.0-only`.
- A structured `README.md` with developer setup and useful commands.
- GitHub community health files:
    - `CODE_OF_CONDUCT.md`
    - `CONTRIBUTING.md`
    - `SECURITY.md`
    - `CONTRIBUTING.md`
    - `SUPPORT.md`
    - Issue templates (bug report / feature request)
    - Pull request template
- GitHub Discussions categories and initial repo hygiene (labels/topics/description).
- CI workflow (GitHub Actions) to build the whole repository on `main` and PRs.
- CI badge in `README.md`.
- Release documentation:
    - `docs/release.md` (SemVer policy + release process)
    - `CHANGELOG.md` (Keep a Changelog format)
- Version sync helper script: `tools/sync-versions.mjs` + `npm run sync:version`.

### Changed

- Services folder structure in the Angular UI is now domain-based:
    - `ui/angular/src/app/services/accounts/`
    - `ui/angular/src/app/services/import/`
    - `ui/angular/src/app/services/games/`
    - `ui/angular/src/app/services/logs/`
    - `ui/angular/src/app/services/explorer/`

### Fixed

- (none)
