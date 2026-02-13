# ECO dataset (opening names)

Source: lichess-org/chess-openings (CC0)
This file is used to seed the local database on first launch.

- Raw input: a.tsv, b.tsv, c.tsv, d.tsv, e.tsv (ECO + name + PGN line)
- Output: lichess-chess-openings.json

Regenerate:

- Run: `npm run eco:update`
- Commit the updated JSON file.
