# Artifacts and checksums

This page lists the expected files in a complete release.

## Linux artifacts

```txt
my-chess-opening-<version>-x86_64.AppImage
my-chess-opening-<version>-amd64.deb
```

## Windows artifacts

```txt
my-chess-opening-<version>-setup-x64.exe
my-chess-opening-<version>-portable-x64.exe
```

## Expected checksums

Each artifact must have a `.sha256` file.

The release must also contain:

```txt
SHA256SUMS
```

## Complete example

```txt
my-chess-opening-1.11.13-x86_64.AppImage
my-chess-opening-1.11.13-x86_64.AppImage.sha256
my-chess-opening-1.11.13-amd64.deb
my-chess-opening-1.11.13-amd64.deb.sha256
my-chess-opening-1.11.13-setup-x64.exe
my-chess-opening-1.11.13-setup-x64.exe.sha256
my-chess-opening-1.11.13-portable-x64.exe
my-chess-opening-1.11.13-portable-x64.exe.sha256
SHA256SUMS
```

## Verify all checksums on Linux

From the folder containing the artifacts:

```bash
sha256sum -c SHA256SUMS
```

## Verify one file on Windows

With PowerShell:

```powershell
Get-FileHash .\my-chess-opening-1.11.13-setup-x64.exe -Algorithm SHA256
```

Compare the result with:

```txt
my-chess-opening-1.11.13-setup-x64.exe.sha256
```

## Important rule

GitHub Release checksums must be generated in the final `publish` job, after downloading all Linux and Windows artifacts.

This avoids publishing an incomplete `SHA256SUMS` file.
