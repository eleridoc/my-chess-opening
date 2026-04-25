# Artefacts et checksums

Cette fiche liste les fichiers attendus dans une release complète.

## Artefacts Linux

```txt
my-chess-opening-<version>-x86_64.AppImage
my-chess-opening-<version>-amd64.deb
```

## Artefacts Windows

```txt
my-chess-opening-<version>-setup-x64.exe
my-chess-opening-<version>-portable-x64.exe
```

## Checksums attendus

Chaque artefact doit avoir un fichier `.sha256`.

La release doit aussi contenir :

```txt
SHA256SUMS
```

## Exemple complet

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

## Vérifier tous les checksums sur Linux

Depuis le dossier contenant les artefacts :

```bash
sha256sum -c SHA256SUMS
```

## Vérifier un fichier sur Windows

Avec PowerShell :

```powershell
Get-FileHash .\my-chess-opening-1.11.13-setup-x64.exe -Algorithm SHA256
```

Comparer le résultat avec :

```txt
my-chess-opening-1.11.13-setup-x64.exe.sha256
```

## Règle importante

Les checksums de la release GitHub doivent être générés dans le job final `publish`, après récupération de tous les artefacts Linux et Windows.

Cela évite d’avoir un `SHA256SUMS` incomplet.
