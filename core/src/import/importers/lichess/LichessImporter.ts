import { GameImporter } from '../GameImporter';
import { ExternalSite, ImportOptions, ImportedGameRaw } from '../../types';
import { splitMultiPgn } from '../../pgn/splitMultiPgn';
import { parsePgnGame } from '../../pgn/parsePgn';
import { normalizeParsedGame } from '../../pgn/normalize';

function toUnixMs(date: Date): number {
	return date.getTime();
}

export class LichessImporter implements GameImporter {
	public readonly site = ExternalSite.LICHESS;

	async importGames(options: ImportOptions): Promise<ImportedGameRaw[]> {
		const {
			username,
			since = null,
			ratedOnly = true,
			speeds = ['bullet', 'blitz', 'rapid'],
			includeMoves = true,
		} = options;

		const perfType = speeds.join(','); // lichess perfType values match our speed strings for standard games
		const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);
		url.searchParams.set('max', '300'); // You can tune this later
		url.searchParams.set('moves', 'true');
		url.searchParams.set('clocks', includeMoves ? 'true' : 'false');
		url.searchParams.set('opening', 'true');
		url.searchParams.set('pgnInJson', 'false');
		url.searchParams.set('perfType', perfType);
		if (ratedOnly) url.searchParams.set('rated', 'true');
		if (since) url.searchParams.set('since', String(toUnixMs(since)));

		const res = await fetch(url.toString(), {
			headers: {
				Accept: 'application/x-chess-pgn',
			},
		});

		if (!res.ok) {
			const txt = await res.text().catch(() => '');
			throw new Error(`Lichess import failed (${res.status}): ${txt.slice(0, 300)}`);
		}

		const text = await res.text();
		const pgns = splitMultiPgn(text);

		const out: ImportedGameRaw[] = [];
		const seen = new Set<string>();

		for (const pgn of pgns) {
			const parsed = parsePgnGame(pgn, includeMoves);
			const normalized = normalizeParsedGame({
				site: ExternalSite.LICHESS,
				parsed,
				rawPgn: pgn,
				ratedHint: true,
			});

			// Ensure the account is a player (case-insensitive)
			const u = username.toLowerCase();
			const isPlayer =
				normalized.players[0].username.toLowerCase() === u ||
				normalized.players[1].username.toLowerCase() === u;

			if (!isPlayer) continue;
			if (since && normalized.playedAt < since) continue; // defensive
			if (ratedOnly && !normalized.rated) continue;
			if (!speeds.includes(normalized.speed)) continue;

			const key = `${normalized.site}:${normalized.externalId}`;
			if (seen.has(key)) continue;
			seen.add(key);

			out.push(normalized);
		}

		// Sort newest -> oldest (optional, but convenient)
		out.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
		return out;
	}
}
