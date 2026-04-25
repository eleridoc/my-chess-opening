# GitHub Release

The GitHub Release is triggered by pushing a stable tag:

```bash
git tag -a v1.11.13 -m "v1.11.13"
git push origin v1.11.13
```

## Expected workflow

The `Release` workflow should contain these jobs:

```txt
validate
build-linux
build-windows
publish
```

## `validate` job

This job should:

- check that the tag matches the `package.json` version;
- generate `RELEASE_NOTES.md` from `CHANGELOG.md`;
- upload release notes as a temporary artifact.

## `build-linux` job

This job should run on:

```txt
ubuntu-latest
```

It should generate:

```txt
release/*.AppImage
release/*.deb
```

## `build-windows` job

This job should run on:

```txt
windows-latest
```

It should generate:

```txt
release/*.exe
```

This job should not require Wine because it runs on a native Windows runner.

## `publish` job

This job should:

- download Linux artifacts;
- download Windows artifacts;
- download `RELEASE_NOTES.md`;
- generate combined checksums;
- publish the GitHub Release;
- send the Discord announcement.

## Why Discord is posted from the same workflow

If a release is created by GitHub Actions with `GITHUB_TOKEN`, another workflow using `on: release` may not be triggered.

To avoid this issue, the Discord announcement should be sent directly from the `publish` job, right after publishing the GitHub Release.

## Discord secret

The GitHub Actions secret must be named:

```txt
DISCORD_RELEASE_WEBHOOK_URL
```

It must be configured in:

```txt
Repository → Settings → Secrets and variables → Actions
```
