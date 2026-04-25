# Local build and smoke tests

This page describes local checks to run before pushing a release.

## Recommended minimum build

```bash
npm ci
npm run build:prod
```

## Local Linux packaging

```bash
npm run package:linux
cd release
sha256sum -c SHA256SUMS
cd ..
```

This validates:

- production build;
- AppImage generation;
- `.deb` generation;
- checksum generation;
- `SHA256SUMS` consistency.

## Local Windows packaging

From Linux, this step may require Wine:

```bash
npm run package:windows
```

The official GitHub workflow builds Windows on `windows-latest`, so this local test is not mandatory for publishing.

## AppImage smoke test

```bash
chmod +x release/my-chess-opening-<version>-x86_64.AppImage
./release/my-chess-opening-<version>-x86_64.AppImage
```

Check:

- the app starts;
- the board renders;
- no visible JavaScript crash;
- logs are created;
- the database is created;
- close / reopen works.

## `.deb` smoke test

```bash
sudo apt install ./release/my-chess-opening-<version>-amd64.deb
my-chess-opening
sudo apt remove my-chess-opening
```

Check:

- installation works;
- command launch works;
- system shortcut is available if supported by the desktop environment;
- uninstalling does not remove user data.

## Minimum functional smoke test

Test at least:

- app startup;
- navigation;
- import;
- explorer;
- My next moves;
- PGN export;
- FEN export;
- PNG export;
- close / reopen.
