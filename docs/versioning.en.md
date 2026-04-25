# Versioning

The project uses **Semantic Versioning**: `MAJOR.MINOR.PATCH`.

Official documentation: <https://semver.org/>

## Single global version

The repository uses one global version for all workspaces:

- `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`

These files must always stay aligned.

## Update the version

Use:

```bash
npm run sync:version -- <version>
```

Example:

```bash
npm run sync:version -- 1.11.13
```

This command updates:

- `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`
- `package-lock.json`

## When to bump PATCH

Examples:

- bug fix;
- refactor with no behavior change;
- documentation;
- workflow adjustment with no major functional impact.

## When to bump MINOR

Examples:

- new user-facing feature;
- new packaging capability;
- visible compatible improvement;
- new release workflow.

## When to bump MAJOR

Examples:

- breaking change;
- major behavior change;
- risky data migration;
- UX change that breaks an existing workflow.

## Git tags

Releases use annotated tags:

```bash
git tag -a v1.11.13 -m "v1.11.13"
git push origin v1.11.13
```

The tag must exactly match the version in `package.json`.

Example:

```txt
tag: v1.11.13
package.json: 1.11.13
```
