# Release troubleshooting

This page lists common release issues.

## The Release workflow does not start

Check that the tag was pushed:

```bash
git push origin v1.11.13
```

Check that the tag matches the pattern:

```txt
v*.*.*
```

## The `validate` job fails

Check that the tag matches `package.json`.

Expected example:

```txt
tag: v1.11.13
package.json: 1.11.13
```

Also check that `CHANGELOG.md` contains a section:

```md
## [1.11.13] - 2026-04-25
```

## The release exists but has no artifacts

Check the `publish` job.

Likely causes:

- build jobs failed;
- artifacts were not uploaded;
- download pattern does not match;
- `release/` is empty in the `publish` job;
- `fail_on_unmatched_files` stopped the upload.

## Linux artifacts are missing

Check the `build-linux` job.

Expected files:

```txt
release/*.AppImage
release/*.deb
```

## Windows artifacts are missing

Check the `build-windows` job.

Expected files:

```txt
release/*.exe
```

The job must run on:

```txt
windows-latest
```

It must not depend on Wine.

## Checksums are missing

Checksums must be generated in the final `publish` job, after downloading Linux and Windows artifacts.

Expected files:

```txt
release/*.sha256
release/SHA256SUMS
```

## Discord does not receive the announcement

Check the step:

```txt
Post release announcement to Discord
```

Likely causes:

- missing `DISCORD_RELEASE_WEBHOOK_URL` secret;
- Discord webhook was deleted;
- webhook was created in the wrong channel;
- HTTP 401 / 403 / 404 error;
- the announcement is in a separate `on: release` workflow that is not triggered.

Recommended solution:

- post to Discord from the same workflow that publishes the release.
