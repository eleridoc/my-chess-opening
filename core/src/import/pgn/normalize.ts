import type {
	ExternalSite,
	GameSpeed,
	ImportedGamePlayer,
	ImportedGameRaw,
	ResultKey,
} from '../types';
import type { ParsedPgnGame } from './parsePgn';
import { enrichMovesWithFenAndHash } from './enrichMovesWithFen';

/**
 * Parse a PGN time control string.
 *
 * Expected formats:
 * - Lichess: often "900+10" (seconds + increment seconds)
 * - Chess.com: commonly the same
 *
 * If parsing fails, returns {0,0} (unknown).
 */
function parseTimeControl(tc: string): { initialSeconds: number; incrementSeconds: number } {
	const m = (tc ?? '').trim().match(/^(\d+)\+(\d+)$/);
	if (!m) return { initialSeconds: 0, incrementSeconds: 0 };
	return { initialSeconds: Number(m[1]), incrementSeconds: Number(m[2]) };
}

/**
 * Compute a rough speed bucket from the initial time.
 * Thresholds are pragmatic (not perfect) but stable and good enough for filtering.
 */
function speedFromInitial(initialSeconds: number): GameSpeed {
	if (initialSeconds <= 180) return 'bullet';
	if (initialSeconds <= 480) return 'blitz';
	if (initialSeconds <= 1500) return 'rapid';
	return 'classical';
}

/**
 * Parse UTC playedAt from common PGN header combinations.
 *
 * Sources observed:
 * - Lichess: UTCDate + UTCTime
 * - Chess.com: sometimes Date + StartTime + Timezone=UTC
 */
function parseUtcDateTime(headers: Record<string, string>): Date | null {
	const utcDate = headers['UTCDate']; // "2025.11.25"
	const utcTime = headers['UTCTime']; // "15:55:12"
	if (utcDate && utcTime) {
		const d = utcDate.replace(/\./g, '-'); // "2025-11-25"
		const iso = `${d}T${utcTime}Z`;
		const dt = new Date(iso);
		if (!Number.isNaN(dt.getTime())) return dt;
	}

	// Fallback: Date + StartTime (chess.com sometimes)
	const date = headers['Date']; // "2025.11.25"
	const startTime = headers['StartTime']; // "15:55:12"
	const tz = headers['Timezone']; // "UTC"
	if (date && startTime && tz?.toUpperCase() === 'UTC') {
		const d = date.replace(/\./g, '-');
		const iso = `${d}T${startTime}Z`;
		const dt = new Date(iso);
		if (!Number.isNaN(dt.getTime())) return dt;
	}

	return null;
}

/**
 * Extract external id and (optional) site URL from PGN headers.
 *
 * Notes:
 * - Lichess usually provides GameId and/or Site.
 * - Chess.com provides Link, but can vary by mode (live/daily/etc.).
 */
function extractExternalIdentity(
	site: ExternalSite,
	headers: Record<string, string>,
): { externalId: string; siteUrl?: string } {
	if (site === 'LICHESS') {
		const gameId = headers['GameId'];
		const url = headers['Site']; // "https://lichess.org/JPZ0OVJW"
		const idFromUrl = url?.match(/lichess\.org\/([a-zA-Z0-9]+)/)?.[1];

		const externalId = gameId || idFromUrl;
		if (!externalId) throw new Error('Unable to extract lichess externalId from PGN headers.');
		return { externalId, siteUrl: url };
	}

	// CHESSCOM
	const link = headers['Link']; // "https://www.chess.com/game/live/145948266412"
	const idFromLink = link?.match(/chess\.com\/game\/\w+\/(\d+)/)?.[1];
	const externalId = idFromLink || headers['GameId'] || link; // fallback, but usually idFromLink exists
	if (!externalId) throw new Error('Unable to extract chess.com externalId from PGN headers.');
	return { externalId, siteUrl: link };
}

function toNumberOrUndefined(v: string | undefined): number | undefined {
	if (!v) return undefined;
	const n = Number(v.trim());
	return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse players from PGN headers.
 *
 * We keep a normalized players tuple [white, black], and we also denormalize
 * white/black fields into ImportedGameRaw for faster persistence/queries.
 */
function parsePlayers(headers: Record<string, string>): [ImportedGamePlayer, ImportedGamePlayer] {
	const white: ImportedGamePlayer = {
		color: 'white',
		username: (headers['White'] || '').trim(),
		elo: toNumberOrUndefined(headers['WhiteElo']),
		ratingDiff: toNumberOrUndefined(headers['WhiteRatingDiff']),
	};

	const black: ImportedGamePlayer = {
		color: 'black',
		username: (headers['Black'] || '').trim(),
		elo: toNumberOrUndefined(headers['BlackElo']),
		ratingDiff: toNumberOrUndefined(headers['BlackRatingDiff']),
	};

	return [white, black];
}

/**
 * Compute a numeric result key from the PGN Result header.
 *
 * White POV:
 *  1 = White win, 0 = draw/unknown, -1 = Black win
 *
 * Owner POV (myResultKey) is computed later by applyOwnerPerspective().
 */
function resultKeyFromResult(result: string): ResultKey {
	if (result === '1-0') return 1;
	if (result === '0-1') return -1;
	return 0; // "1/2-1/2" or "*"
}

/**
 * Normalize a parsed PGN game into ImportedGameRaw.
 *
 * This function is intentionally "objective": it only uses PGN headers and parsed moves,
 * and does not compute owner-relative fields (myColor/myUsername/myResultKey).
 * Those are computed later by applyOwnerPerspective().
 */
export function normalizeParsedGame(params: {
	site: ExternalSite;
	parsed: ParsedPgnGame;
	rawPgn: string;
	ratedHint?: boolean; // optional hint from API (chess.com JSON)
	variantHint?: string; // optional hint from API
}): ImportedGameRaw {
	const { site, parsed, rawPgn, ratedHint, variantHint } = params;
	const h = parsed.headers;

	const { externalId, siteUrl } = extractExternalIdentity(site, h);

	const playedAt = parseUtcDateTime(h);
	if (!playedAt) throw new Error(`Unable to parse playedAt for ${site}:${externalId}`);

	const timeControl = h['TimeControl'] || '0+0';
	const { initialSeconds, incrementSeconds } = parseTimeControl(timeControl);
	const speed: GameSpeed = speedFromInitial(initialSeconds);

	const variant = h['Variant'] || variantHint || 'Standard';

	// If no hint is provided, we default to "rated" (conservative).
	const rated = typeof ratedHint === 'boolean' ? ratedHint : true;

	const [white, black] = parsePlayers(h);

	const debugId = `${site}:${externalId}`;

	const moves = parsed.moves
		? enrichMovesWithFenAndHash({
				headers: h,
				moves: parsed.moves,
				debugId,
			})
		: undefined;

	const result = h['Result'] || '*';
	const resultKey = resultKeyFromResult(result);

	return {
		// External identity
		site,
		externalId,
		siteUrl,

		// Time / meta
		playedAt,
		rated,
		variant,
		speed,
		timeControl,
		initialSeconds,
		incrementSeconds,

		// Result (objective: White POV)
		result,
		resultKey,

		termination: h['Termination'],
		eco: h['ECO'],
		opening: h['Opening'],
		pgn: rawPgn,

		// Players (objective)
		players: [white, black],

		// Denormalized snapshot (objective)
		whiteUsername: white.username,
		blackUsername: black.username,
		whiteElo: white.elo,
		blackElo: black.elo,
		whiteRatingDiff: white.ratingDiff,
		blackRatingDiff: black.ratingDiff,

		// Moves enriched with FEN/hash/uci + positionHashBefore
		moves,
	};
}
