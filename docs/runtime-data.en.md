# Runtime data locations

This page summarizes where the app stores data depending on the environment.

## Local development

When the app runs from the repository:

```txt
.runtime/user-data
```

SQLite database:

```txt
.runtime/user-data/data/my-chess-opening.sqlite
```

## Linux production

For AppImage and `.deb`:

```txt
~/.config/my-chess-opening
```

SQLite database:

```txt
~/.config/my-chess-opening/data/my-chess-opening.sqlite
```

Logs:

```txt
~/.config/my-chess-opening/logs
```

Remove test data:

```bash
rm -rf ~/.config/my-chess-opening
```

## Windows production

For the NSIS installer and portable executable:

```txt
%APPDATA%\my-chess-opening
```

Usual resolved path:

```txt
C:\Users\<user>\AppData\Roaming\my-chess-opening
```

SQLite database:

```txt
%APPDATA%\my-chess-opening\data\my-chess-opening.sqlite
```

Logs:

```txt
%APPDATA%\my-chess-opening\logs
```

Remove test data with PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\my-chess-opening"
```

## Important rule

Uninstalling the app does not automatically remove user data.

This is intentional to avoid deleting the user's local database.
