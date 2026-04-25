# Checklist rapide de release

Cette fiche est le process court à utiliser pour publier une version stable.

Remplace `1.11.13` par la version réelle.

## 1. Changer la version

```bash
npm run sync:version -- 1.11.13
```

Vérifier les fichiers modifiés :

```bash
git diff package.json core/package.json electron/package.json ui/angular/package.json package-lock.json
```

## 2. Mettre à jour le changelog

Dans `CHANGELOG.md` :

- déplacer les entrées de `[Unreleased]` vers une section versionnée ;
- ajouter la date de release ;
- garder un bloc `[Unreleased]` propre pour la suite.

Exemple :

```md
## [1.11.13] - 2026-04-25

### Added

- Added Windows installation documentation.

### Changed

- Updated release documentation for multi-platform releases.

### Fixed

- Fixed Discord release announcements.
```

## 3. Vérifier les notes de release en local

Cette étape n’est pas obligatoire, car GitHub Actions la fera aussi, mais elle évite de tagger avec un changelog mal formé.

```bash
node tools/extract-release-notes.mjs v1.11.13
cat RELEASE_NOTES.md
rm RELEASE_NOTES.md
```

## 4. Build local minimum avant commit

```bash
npm ci
npm run build:prod
npm run package:linux
cd release
sha256sum -c SHA256SUMS
cd ..
```

## 5. Commit de préparation

```bash
git status
git add README.md docs/release.md docs/release CHANGELOG.md package.json package-lock.json core/package.json electron/package.json ui/angular/package.json
git commit -m "chore(release): prepare v1.11.13"
```

Adapte les fichiers du `git add` selon les modifications réelles.

## 6. Push de `main`

```bash
git push origin main
```

Tu peux utiliser `git push` si ta branche locale suit bien `origin/main`.

## 7. Attendre que la CI passe

Sur GitHub Actions, vérifier que le workflow CI de `main` passe avant de créer le tag.

## 8. Créer et pousser le tag

```bash
git tag -a v1.11.13 -m "v1.11.13"
git push origin v1.11.13
```

## 9. Vérifier le workflow Release

Sur GitHub Actions, vérifier :

```txt
Release
  validate
  build-linux
  build-windows
  publish
```

Tous les jobs doivent passer.

## 10. Vérifier la release GitHub

La release doit contenir :

```txt
my-chess-opening-1.11.13-x86_64.AppImage
my-chess-opening-1.11.13-amd64.deb
my-chess-opening-1.11.13-setup-x64.exe
my-chess-opening-1.11.13-portable-x64.exe
*.sha256
SHA256SUMS
```

## 11. Vérifier Discord

Le message de release doit être publié dans le salon Discord configuré par le webhook.

## 12. Smoke tests depuis les fichiers publiés

Télécharger les fichiers depuis GitHub Releases, puis vérifier :

- AppImage Linux ;
- `.deb` Linux ;
- portable Windows ;
- installer Windows ;
- checksums ;
- lancement de l’app ;
- création de la DB ;
- fermeture / réouverture ;
- import ;
- explorer ;
- export PGN ;
- export position.
