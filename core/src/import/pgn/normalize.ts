import { ExternalSite, GameSpeed, ImportedGamePlayer, ImportedGameRaw } from '../types';
import { ParsedPgnGame } from './parsePgn';

function parseTimeControl(tc: string): { initialSeconds: number; incrementSeconds: number } {
	// "900+10"
	const m = tc.trim().match(/^(\d+)\+(\d+)$/);
	if (!m) return { initialSeconds: 0, incrementSeconds: 0 };
	return { initialSeconds: Number(m[1]), incrementSeconds: Number(m[2]) };
}

function speedFromInitial(initialSeconds: number): GameSpeed {
	// Pragmatic thresholds
	if (initialSeconds <= 180) return 'bullet';
	if (initialSeconds <= 480) return 'blitz';
	if (initialSeconds <= 1500) return 'rapid';
	return 'classical';
}

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

function extractExternalIdentity(
	site: ExternalSite,
	headers: Record<string, string>,
): { externalId: string; siteUrl?: string } {
	if (site === ExternalSite.LICHESS) {
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

function parsePlayers(headers: Record<string, string>): [ImportedGamePlayer, ImportedGamePlayer] {
	const white: ImportedGamePlayer = {
		color: 'white',
		username: headers['White'] || '',
		elo: headers['WhiteElo'] ? Number(headers['WhiteElo']) : undefined,
		ratingDiff: headers['WhiteRatingDiff'] ? Number(headers['WhiteRatingDiff']) : undefined,
	};
	const black: ImportedGamePlayer = {
		color: 'black',
		username: headers['Black'] || '',
		elo: headers['BlackElo'] ? Number(headers['BlackElo']) : undefined,
		ratingDiff: headers['BlackRatingDiff'] ? Number(headers['BlackRatingDiff']) : undefined,
	};
	return [white, black];
}

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
	const rated = typeof ratedHint === 'boolean' ? ratedHint : true; // Lichess endpoint will already filter rated in our usage.

	const players = parsePlayers(h);

	return {
		site,
		externalId,
		siteUrl,

		playedAt,
		rated,
		variant,
		speed,
		timeControl,
		initialSeconds,
		incrementSeconds,

		result: h['Result'] || '*',
		termination: h['Termination'],
		eco: h['ECO'],
		opening: h['Opening'],

		pgn: rawPgn,
		players,
		moves: parsed.moves,
	};
}
