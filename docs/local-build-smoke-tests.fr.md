# Build local et smoke tests

Cette fiche décrit les vérifications locales à faire avant de pousser une release.

## Build minimum recommandé

```bash
npm ci
npm run build:prod
```

## Packaging Linux local

```bash
npm run package:linux
cd release
sha256sum -c SHA256SUMS
cd ..
```

Cette étape valide :

- le build production ;
- la génération AppImage ;
- la génération `.deb` ;
- la génération des checksums ;
- la cohérence de `SHA256SUMS`.

## Packaging Windows local

Depuis Linux, cette étape peut nécessiter Wine :

```bash
npm run package:windows
```

Le workflow officiel GitHub construit Windows sur `windows-latest`, donc ce test local n’est pas obligatoire pour publier.

## Smoke test AppImage

```bash
chmod +x release/my-chess-opening-<version>-x86_64.AppImage
./release/my-chess-opening-<version>-x86_64.AppImage
```

À vérifier :

- l’application démarre ;
- le board s’affiche ;
- aucun crash JavaScript visible ;
- les logs sont créés ;
- la DB est créée ;
- la fermeture / réouverture fonctionne.

## Smoke test `.deb`

```bash
sudo apt install ./release/my-chess-opening-<version>-amd64.deb
my-chess-opening
sudo apt remove my-chess-opening
```

À vérifier :

- l’installation fonctionne ;
- le lancement via commande fonctionne ;
- le raccourci système est disponible si l’environnement le supporte ;
- la désinstallation ne supprime pas les données utilisateur.

## Smoke test fonctionnel minimum

Tester au minimum :

- ouverture de l’app ;
- navigation ;
- import ;
- explorer ;
- My next moves ;
- export PGN ;
- export FEN ;
- export PNG ;
- fermeture / réouverture.
