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
