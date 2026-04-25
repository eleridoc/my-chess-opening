# Dépannage release

Cette fiche liste les problèmes courants pendant une release.

## Le workflow Release ne démarre pas

Vérifier que le tag a bien été poussé :

```bash
git push origin v1.11.13
```

Vérifier que le tag correspond au pattern :

```txt
v*.*.*
```

## Le job `validate` échoue

Vérifier que le tag correspond à `package.json`.

Exemple attendu :

```txt
tag: v1.11.13
package.json: 1.11.13
```

Vérifier aussi que `CHANGELOG.md` contient une section :

```md
## [1.11.13] - 2026-04-25
```

## La release existe mais sans artefacts

Vérifier le job `publish`.

Causes probables :

- les jobs de build ont échoué ;
- les artefacts n’ont pas été uploadés ;
- le pattern de téléchargement ne correspond pas ;
- le dossier `release/` est vide dans le job `publish` ;
- `fail_on_unmatched_files` a stoppé l’upload.

## Les artefacts Linux manquent

Vérifier le job `build-linux`.

Fichiers attendus :

```txt
release/*.AppImage
release/*.deb
```

## Les artefacts Windows manquent

Vérifier le job `build-windows`.

Fichiers attendus :

```txt
release/*.exe
```

Le job doit tourner sur :

```txt
windows-latest
```

Il ne doit pas dépendre de Wine.

## Les checksums manquent

Les checksums doivent être générés dans le job final `publish`, après téléchargement des artefacts Linux et Windows.

Fichiers attendus :

```txt
release/*.sha256
release/SHA256SUMS
```

## Discord ne reçoit pas l’annonce

Vérifier l’étape :

```txt
Post release announcement to Discord
```

Causes probables :

- secret `DISCORD_RELEASE_WEBHOOK_URL` absent ;
- webhook Discord supprimé ;
- webhook créé dans le mauvais salon ;
- erreur HTTP 401 / 403 / 404 ;
- l’annonce est dans un workflow séparé `on: release` qui n’est pas déclenché.

Solution recommandée :

- poster sur Discord depuis le même workflow que la publication de release.
