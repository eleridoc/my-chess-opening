# Stockfish engine binaries

This folder contains the local layout used by My Chess Opening to bundle Stockfish with packaged builds.

Stockfish is a free and open-source UCI chess engine distributed under the GNU General Public License.

Official website:

https://stockfishchess.org/

Official repository:

https://github.com/official-stockfish/Stockfish

Expected local layout after running the install script:

```txt
electron/assets/engines/stockfish/linux-x64/stockfish
electron/assets/engines/stockfish/win-x64/stockfish.exe
```

The native binaries are intentionally not committed to Git because GitHub rejects files larger than 100 MB.

Use:

```bash
npm run stockfish:install
```

or platform-specific commands:

```bash
npm run stockfish:install:linux
npm run stockfish:install:windows
```

Notes:

- Keep binary names stable so Electron path resolution remains simple.
- Linux binaries must keep executable permissions.
- Prefer broadly compatible x86-64 binaries unless CPU capability detection is added later.
