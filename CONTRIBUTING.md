# Contributing

Thanks for your interest in contributing to My Chess Opening.

## Quick start

1. Fork the repository and create a branch:
    - `feat/<short-name>` for features
    - `fix/<short-name>` for fixes
    - `chore/<short-name>` for refactors/tooling/docs

2. Install dependencies:

    ```bash
    npm install
    ```

3. Build everything:

    ```bash
    npm run build:all
    ```

4. Run Electron:
    ```bash
    npm run build:all:run:electron
    ```

## Project conventions

- Keep code comments and logs in English.
- Database dates must be stored as ISO 8601 strings.
- UI:
    - Confirm dialogs must use: `ui/angular/src/app/shared/dialogs/confirm/dialog`
    - Notifications must use: `ui/angular/src/app/shared/notifications/`
    - External links must use: `ui/angular/src/app/shared/system/external-link.service`
    - Date formatting must use: `ui/angular/src/app/shared/dates/pipes`
    - Loading must use: `ui/angular/src/app/shared/loading/`

## Pull requests

- Keep PRs focused (single topic per PR).
- Include a short description + screenshots/GIFs if it impacts the UI.
- Ensure `npm run build:all` succeeds.

## Reporting bugs

Please use the Bug Report template. Include:

- OS and environment
- steps to reproduce
- expected vs actual behavior
- logs/screenshots if relevant
