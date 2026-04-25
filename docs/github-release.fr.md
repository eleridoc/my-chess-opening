# Release GitHub

La release GitHub est déclenchée par le push d’un tag stable :

```bash
git tag -a v1.11.13 -m "v1.11.13"
git push origin v1.11.13
```

## Workflow attendu

Le workflow `Release` doit contenir les jobs suivants :

```txt
validate
build-linux
build-windows
publish
```

## Job `validate`

Ce job doit :

- vérifier que le tag correspond à la version de `package.json` ;
- générer `RELEASE_NOTES.md` depuis `CHANGELOG.md` ;
- uploader les notes de release comme artefact temporaire.

## Job `build-linux`

Ce job doit tourner sur :

```txt
ubuntu-latest
```

Il doit générer :

```txt
release/*.AppImage
release/*.deb
```

## Job `build-windows`

Ce job doit tourner sur :

```txt
windows-latest
```

Il doit générer :

```txt
release/*.exe
```

Ce job ne doit pas avoir besoin de Wine, car il tourne sur un runner Windows natif.

## Job `publish`

Ce job doit :

- télécharger les artefacts Linux ;
- télécharger les artefacts Windows ;
- télécharger `RELEASE_NOTES.md` ;
- générer les checksums combinés ;
- publier la release GitHub ;
- envoyer l’annonce Discord.

## Pourquoi annoncer Discord dans le même workflow

Si une release est créée par GitHub Actions avec `GITHUB_TOKEN`, un autre workflow `on: release` peut ne pas être déclenché.

Pour éviter ce problème, l’annonce Discord doit être faite directement dans le job `publish`, juste après la publication GitHub.

## Secret Discord

Le secret GitHub Actions doit s’appeler :

```txt
DISCORD_RELEASE_WEBHOOK_URL
```

Il doit être configuré dans :

```txt
Repository → Settings → Secrets and variables → Actions
```
