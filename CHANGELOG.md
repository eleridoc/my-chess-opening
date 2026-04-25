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

## [1.12]

### Added

- Added a `Last 12 months` period preset to all shared game filter contexts, preparing the default Dashboard period for V1.12.
- Added a dedicated `dashboard` shared game filter context with its own localStorage scope.
- Configured the Dashboard filter context to expose only played date fields and default to `Last 12 months`.
- Added shared Dashboard IPC contracts for the upcoming Dashboard overview.
- Added the Dashboard Electron IPC backend handler with Prisma-based overview loading.
- Added initial Dashboard backend aggregations for global stats, daily activity, result ratio, per-account data, per-speed data and Elo history.
- Extracted Dashboard backend aggregation logic into a dedicated Electron module.
- Added an Angular Dashboard service wrapping the Dashboard overview IPC API.
- Wired the Dashboard page to the dedicated inline shared filter and Dashboard overview IPC service.
- Added Dashboard loading, error and empty states.
- Added the first Dashboard global summary card with total games, wins, draws, losses and result percentages.
- Added `cal-heatmap` as the Dashboard calendar heatmap dependency.
- Added an Angular Dashboard heatmap wrapper component for upcoming activity and result-ratio charts.
- Added the global Dashboard daily activity heatmap showing games played by day.

### Changed

- (placeholder)

### Fixed

- (placeholder)

## [1.11.13]

### Added

- Added Windows installation documentation for NSIS installer and portable executable.
- Added Windows runtime data documentation, including `%APPDATA%\my-chess-opening`.
- Added Windows smoke test checklist for portable and installed builds.
- Added Discord release announcement directly in the GitHub release workflow.
- Added multi-platform GitHub release automation with separate Linux and Windows build jobs.
- Added Windows release artifacts generation on `windows-latest` for NSIS installer and portable executable.
- Added combined release checksum generation after collecting Linux and Windows artifacts.
- Windows packaging support with:
    - NSIS installer generation
    - portable `.exe` generation
    - Windows `.exe` checksum generation

### Changed

- Updated release documentation for multi-platform Linux and Windows releases.
- Updated README packaging documentation to include Windows artifacts and checksum verification.
- Validated Windows runtime behavior for both portable and NSIS installer builds.
- Replaced the Linux-only release workflow with a unified multi-platform release workflow.

### Fixed

- Fixed Discord release announcements not running reliably when releases are created by GitHub Actions.
- Fixed missing **My next moves** arrows on fresh packaged Linux installs by defaulting the Explorer board arrows mode to top 3.
- Fixed Ubuntu font not being applied on Windows packages by bundling it with the Angular build.
- Avoided platform-specific `SHA256SUMS` conflicts by generating checksums only once during the final release publish job.

## [1.11.9] - 2026-04-24

### Added

- Production-ready Electron renderer runtime with:
    - development mode loading the Angular dev server
    - production/local preview mode loading the Angular production build
    - custom `mco://renderer` protocol for serving the packaged Angular renderer
    - renderer build existence check before local production startup
- Centralized runtime path management in Electron with:
    - development runtime directory
    - production user data directory
    - logs directory
    - database directory
    - renderer dist directory
    - assets directory
    - Prisma schema and migrations paths
- Runtime SQLite database initialization with Prisma migrations.
- Linux packaging support with:
    - AppImage generation
    - Debian package generation
- Automated GitHub Release workflow for Linux artifacts.
- SHA-256 checksum generation for release artifacts.
- Release documentation covering:
    - production preview
    - Linux installation
    - AppImage usage
    - Debian package usage
    - runtime data locations
    - checksum verification
    - production smoke tests

### Changed

- Electron startup now separates development and production renderer loading.
- Production renderer loading now uses the `mco://renderer` custom protocol instead of depending on the Angular dev server.
- Packaged app data is now stored under `~/.config/my-chess-opening`.
- Prisma initialization is now lazy and runtime-aware.
- `DATABASE_URL` is now configured at runtime from the Electron runtime database path.
- Production build and packaging scripts are now explicit and reproducible.
- CI now validates production build artifacts.

### Fixed

- Fixed production CSS loading blocked by CSP-incompatible Angular critical CSS output.
- Fixed theme switching behavior in production preview.
- Fixed packaged renderer loading without Angular dev server.
- Fixed packaged AppImage startup failing to resolve `my-chess-opening-core`.
- Fixed packaged SQLite database initialization path.
- Fixed `.deb` packaging metadata requirements.
- Fixed release artifact integrity verification by adding SHA-256 checksums.

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
