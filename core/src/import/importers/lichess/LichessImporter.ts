import { GameImporter } from '../GameImporter';
import { ExternalSite, ImportOptions, ImportedGameRaw } from '../../types';
import { splitMultiPgn } from '../../pgn/splitMultiPgn';
import { parsePgnGame } from '../../pgn/parsePgn';
import { normalizeParsedGame } from '../../pgn/normalize';
import { applyOwnerPerspective } from '../../perspective/applyOwnerPerspective';
import { fetchWithRetry } from '../../http/fetchWithRetry';

function toUnixMs(date: Date): number {
	return date.getTime();
}

// Batch size per HTTP request in production.
// This is NOT a global limit; we page using "until" until we reach the end.
const LICHESS_BATCH_SIZE = 300;

export class LichessImporter implements GameImporter {
	public readonly site = ExternalSite.LICHESS;

	private buildUrl(params: {
		username: string;
		since: Date | null;
		untilMs?: number;
		ratedOnly: boolean;
		speeds: string[];
		includeMoves: boolean;
		max: number;
	}): URL {
		const { username, since, untilMs, ratedOnly, speeds, includeMoves, max } = params;

		const perfType = speeds.join(','); // lichess perfType values match our speed strings for standard games
		const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`);

		url.searchParams.set('max', String(max));
		url.searchParams.set('moves', 'true');
		url.searchParams.set('clocks', includeMoves ? 'true' : 'false');
		url.searchParams.set('opening', 'true');
		url.searchParams.set('pgnInJson', 'false');
		url.searchParams.set('perfType', perfType);

		if (ratedOnly) url.searchParams.set('rated', 'true');
		if (since) url.searchParams.set('since', String(toUnixMs(since)));
		if (typeof untilMs === 'number') url.searchParams.set('until', String(untilMs));

		return url;
	}

	private async fetchPgnText(url: URL): Promise<string> {
		const res = await fetchWithRetry(url, {
			headers: { Accept: 'application/x-chess-pgn' },
			minDelayMs: 300, // spacing
			maxRetries: 5, // retry
			baseBackoffMs: 500,
			maxBackoffMs: 8000,
			retryOn5xx: true,
		});

		if (!res.ok) {
			const txt = await res.text().catch(() => '');
			throw new Error(`Lichess import failed (${res.status}): ${txt.slice(0, 300)}`);
		}

		return res.text();
	}

	async importGames(options: ImportOptions): Promise<ImportedGameRaw[]> {
		const {
			username,
			since = null,
			ratedOnly = true,
			speeds = ['bullet', 'blitz', 'rapid'],
			includeMoves = true,
			maxGames, // DEV/TEST ONLY: global limit (to avoid API spam)
		} = options;

		const out: ImportedGameRaw[] = [];
		const seen = new Set<string>();

		const u = username.toLowerCase();

		// ---------------------------------------------
		// DEV/TEST MODE: single request, hard limit
		// ---------------------------------------------
		if (typeof maxGames === 'number' && maxGames > 0) {
			const url = this.buildUrl({
				username,
				since,
				ratedOnly,
				speeds,
				includeMoves,
				max: maxGames,
			});

			const text = await this.fetchPgnText(url);
			const pgns = splitMultiPgn(text);

			for (const pgn of pgns) {
				const parsed = parsePgnGame(pgn, includeMoves);

				const normalized = normalizeParsedGame({
					site: ExternalSite.LICHESS,
					parsed,
					rawPgn: pgn,
					ratedHint: true,
				});

				// Ensure the account is a player (case-insensitive)
				const isPlayer =
					normalized.players[0].username.toLowerCase() === u ||
					normalized.players[1].username.toLowerCase() === u;

				if (!isPlayer) continue;
				if (since && normalized.playedAt < since) continue; // defensive
				if (ratedOnly && !normalized.rated) continue;
				if (!speeds.includes(normalized.speed)) continue;

				// Apply owner perspective (myColor / opponentElo / etc.)
				const withPerspective = applyOwnerPerspective(normalized, username);

				const key = `${withPerspective.site}:${withPerspective.externalId}`;
				if (seen.has(key)) continue;
				seen.add(key);

				out.push(withPerspective);

				// Safety: if something weird happens with duplicates/filters,
				// we still enforce the hard maxGames limit.
				if (out.length >= maxGames) break;
			}

			out.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
			return out;
		}

		// ---------------------------------------------
		// PROD MODE: page backwards with "until" (no global limit)
		// ---------------------------------------------
		let untilMs: number | undefined = undefined;

		// Safety guard to avoid infinite loops in case of unexpected behavior.
		for (let page = 0; page < 100000; page++) {
			const url = this.buildUrl({
				username,
				since,
				untilMs,
				ratedOnly,
				speeds,
				includeMoves,
				max: LICHESS_BATCH_SIZE,
			});

			const text = await this.fetchPgnText(url);
			const pgns = splitMultiPgn(text);

			// No more games available
			if (pgns.length === 0) break;

			let oldestInBatch: Date | null = null;

			for (const pgn of pgns) {
				const parsed = parsePgnGame(pgn, includeMoves);

				const normalized = normalizeParsedGame({
					site: ExternalSite.LICHESS,
					parsed,
					rawPgn: pgn,
					ratedHint: true,
				});

				// Ensure the account is a player (case-insensitive)
				const isPlayer =
					normalized.players[0].username.toLowerCase() === u ||
					normalized.players[1].username.toLowerCase() === u;

				if (!isPlayer) continue;
				if (since && normalized.playedAt < since) continue; // defensive
				if (ratedOnly && !normalized.rated) continue;
				if (!speeds.includes(normalized.speed)) continue;

				// Apply owner perspective (myColor / opponentElo / etc.)
				const withPerspective = applyOwnerPerspective(normalized, username);

				const key = `${withPerspective.site}:${withPerspective.externalId}`;
				if (seen.has(key)) continue;
				seen.add(key);

				out.push(withPerspective);

				if (!oldestInBatch || withPerspective.playedAt < oldestInBatch) {
					oldestInBatch = withPerspective.playedAt;
				}
			}

			// If we have a since and the oldest accepted game in this batch is <= since,
			// the next pages would be even older.
			if (since && oldestInBatch && oldestInBatch.getTime() <= since.getTime()) {
				break;
			}

			// Prepare next page: request games strictly older than the oldest we accepted.
			// This avoids duplicates between pages.
			if (oldestInBatch) {
				untilMs = oldestInBatch.getTime() - 1;
			} else {
				// If nothing got accepted due to filters but we still got a full batch,
				// keep paging. If the batch is smaller than requested, we are likely done.
				if (pgns.length < LICHESS_BATCH_SIZE) break;
			}

			// If Lichess returned fewer games than batch size, we likely reached the end.
			if (pgns.length < LICHESS_BATCH_SIZE) break;
		}

		out.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
		return out;
	}
}
