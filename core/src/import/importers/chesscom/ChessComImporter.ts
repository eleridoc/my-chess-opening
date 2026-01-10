import { GameImporter } from '../GameImporter';
import { ExternalSite, ImportOptions, ImportedGameRaw, GameSpeed } from '../../types';
import { parsePgnGame } from '../../pgn/parsePgn';
import { normalizeParsedGame } from '../../pgn/normalize';

type ChessComArchivesResponse = {
	archives: string[];
};

type ChessComMonthlyGamesResponse = {
	games: Array<{
		url: string;
		pgn: string;
		rated?: boolean;
		time_class?: 'bullet' | 'blitz' | 'rapid' | 'daily';
		rules?: 'chess' | string;
	}>;
};

function monthEndFromArchiveUrl(url: string): Date | null {
	// https://api.chess.com/pub/player/<user>/games/2025/11
	const m = url.match(/\/games\/(\d{4})\/(\d{2})$/);
	if (!m) return null;
	const year = Number(m[1]);
	const month = Number(m[2]); // 1-12
	// end of month in UTC
	const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // day 0 of next month is last day of target month
	return end;
}

function mapChessComTimeClass(tc: string | undefined): GameSpeed | null {
	if (!tc) return null;
	if (tc === 'bullet' || tc === 'blitz' || tc === 'rapid') return tc;
	if (tc === 'daily') return 'classical'; // not imported anyway
	return null;
}

export class ChessComImporter implements GameImporter {
	public readonly site = ExternalSite.CHESSCOM;

	async importGames(options: ImportOptions): Promise<ImportedGameRaw[]> {
		const {
			username,
			since = null,
			ratedOnly = true,
			speeds = ['bullet', 'blitz', 'rapid'],
			includeMoves = true,
		} = options;

		const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`;
		console.log('archivesUrl: ' + archivesUrl);
		const archivesRes = await fetch(archivesUrl);
		if (!archivesRes.ok) {
			const txt = await archivesRes.text().catch(() => '');
			throw new Error(
				`Chess.com archives fetch failed (${archivesRes.status}): ${txt.slice(0, 300)}`,
			);
		}

		const archivesJson = (await archivesRes.json()) as ChessComArchivesResponse;
		const archives = (archivesJson.archives || []).slice();

		// Iterate newest -> oldest
		archives.sort().reverse();

		const out: ImportedGameRaw[] = [];
		const seen = new Set<string>();

		for (const monthUrl of archives) {
			if (since) {
				const monthEnd = monthEndFromArchiveUrl(monthUrl);
				if (monthEnd && monthEnd < since) break; // older than since => can stop (archives are descending)
			}

			const monthRes = await fetch(monthUrl);
			if (!monthRes.ok) {
				const txt = await monthRes.text().catch(() => '');
				throw new Error(
					`Chess.com monthly fetch failed (${monthRes.status}): ${txt.slice(0, 300)}`,
				);
			}

			const monthJson = (await monthRes.json()) as ChessComMonthlyGamesResponse;
			const games = monthJson.games || [];

			let maxPlayedAtInThisMonth = 0;

			for (const g of games) {
				// Pre-filters from JSON
				if (g.rules && g.rules !== 'chess') continue;
				if (ratedOnly && g.rated === false) continue;

				const speedHint = mapChessComTimeClass(g.time_class);
				if (speedHint && !speeds.includes(speedHint)) continue;

				const pgn = g.pgn?.trim();
				if (!pgn) continue;

				const parsed = parsePgnGame(pgn, includeMoves);
				const normalized = normalizeParsedGame({
					site: ExternalSite.CHESSCOM,
					parsed,
					rawPgn: pgn,
					ratedHint: g.rated ?? true,
					variantHint: 'Standard',
				});

				// Ensure the account is a player
				const u = username.toLowerCase();
				const isPlayer =
					normalized.players[0].username.toLowerCase() === u ||
					normalized.players[1].username.toLowerCase() === u;

				if (!isPlayer) continue;
				if (since && normalized.playedAt < since) continue;
				if (ratedOnly && !normalized.rated) continue;
				if (!speeds.includes(normalized.speed)) continue;

				maxPlayedAtInThisMonth = Math.max(
					maxPlayedAtInThisMonth,
					normalized.playedAt.getTime(),
				);

				const key = `${normalized.site}:${normalized.externalId}`;
				if (seen.has(key)) continue;
				seen.add(key);

				out.push(normalized);
			}

			// Extra stop condition: if everything we saw in this month is older than since, next months will be older too.
			if (since && maxPlayedAtInThisMonth > 0 && maxPlayedAtInThisMonth < since.getTime()) {
				break;
			}
		}

		out.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
		return out;
	}
}
