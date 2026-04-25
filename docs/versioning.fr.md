# Versioning

Le projet utilise **Semantic Versioning** : `MAJOR.MINOR.PATCH`.

Documentation officielle : <https://semver.org/>

## Version globale unique

Le dépôt utilise une seule version globale pour tous les workspaces :

- `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`

Ces fichiers doivent toujours rester alignés.

## Changer la version

Utiliser :

```bash
npm run sync:version -- <version>
```

Exemple :

```bash
npm run sync:version -- 1.11.13
```

Cette commande met à jour :

- `package.json`
- `core/package.json`
- `electron/package.json`
- `ui/angular/package.json`
- `package-lock.json`

## Quand changer PATCH

Exemples :

- correction de bug ;
- refactor sans changement de comportement ;
- documentation ;
- ajustement de workflow sans changement fonctionnel majeur.

## Quand changer MINOR

Exemples :

- nouvelle fonctionnalité utilisateur ;
- nouvelle capacité de packaging ;
- amélioration visible mais compatible ;
- ajout d’un nouveau workflow de release.

## Quand changer MAJOR

Exemples :

- changement cassant ;
- modification majeure du comportement ;
- migration de données risquée ;
- changement UX qui casse un workflow existant.

## Tags Git

Les releases utilisent des tags annotés :

```bash
git tag -a v1.11.13 -m "v1.11.13"
git push origin v1.11.13
```

Le tag doit correspondre exactement à la version dans `package.json`.

Exemple :

```txt
tag: v1.11.13
package.json: 1.11.13
```
