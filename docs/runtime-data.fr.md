# Emplacements des données runtime

Cette fiche résume où l’application stocke ses données selon l’environnement.

## Développement local

Quand l’application tourne depuis le dépôt :

```txt
.runtime/user-data
```

Base SQLite :

```txt
.runtime/user-data/data/my-chess-opening.sqlite
```

## Production Linux

Pour AppImage et `.deb` :

```txt
~/.config/my-chess-opening
```

Base SQLite :

```txt
~/.config/my-chess-opening/data/my-chess-opening.sqlite
```

Logs :

```txt
~/.config/my-chess-opening/logs
```

Supprimer les données de test :

```bash
rm -rf ~/.config/my-chess-opening
```

## Production Windows

Pour l’installer NSIS et le portable :

```txt
%APPDATA%\my-chess-opening
```

Résolution habituelle :

```txt
C:\Users\<user>\AppData\Roaming\my-chess-opening
```

Base SQLite :

```txt
%APPDATA%\my-chess-opening\data\my-chess-opening.sqlite
```

Logs :

```txt
%APPDATA%\my-chess-opening\logs
```

Supprimer les données de test avec PowerShell :

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\my-chess-opening"
```

## Règle importante

La désinstallation de l’application ne supprime pas automatiquement les données utilisateur.

C’est volontaire pour éviter de perdre la base de données locale de l’utilisateur.
