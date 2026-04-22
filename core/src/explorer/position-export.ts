import { Chess } from 'chess.js';

import type { ExplorerMove } from './model';
import type { ExplorerGameHeaders, ExplorerSessionSource } from './types';
import type { PgnTags } from './utils/pgn-tags';

export type BuildExplorerCurrentLinePgnParams = {
	/** Current Explorer source. */
	source: ExplorerSessionSource;

	/** Root position of the current session. */
	rootFen: string;

	/** Active line from root to the current cursor. */
	currentPathMoves: readonly ExplorerMove[];

	/** Best-effort normalized headers (DB snapshot, mapped PGN tags, etc.). */
	headers?: ExplorerGameHeaders | null;

	/** Raw PGN tags when available. Preferred over normalized headers for fidelity. */
	pgnTags?: PgnTags | null;
};

const STANDARD_START_FEN = new Chess().fen();

const PRIMARY_TAG_ORDER = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'] as const;

const SECONDARY_TAG_ORDER = ['SetUp', 'FEN'] as const;

/**
 * Builds a PGN representing the current active line up to the current cursor.
 *
 * Design choices:
 * - Export only the active line (no RAV/variation blocks in V1.10.3).
 * - Always export Result as "*" because the line may be truncated before the original game end.
 * - Preserve raw PGN tags when available, but allow normalized headers as a fallback source.
 * - Add SetUp/FEN tags automatically when the root position is not the standard initial position.
 */
export function buildExplorerCurrentLinePgn(params: BuildExplorerCurrentLinePgnParams): string {
	const chess = createChessFromFenOrInitial(params.rootFen);
	const effectiveRootFen = chess.fen();

	for (const move of params.currentPathMoves ?? []) {
		const applied = tryApplyExplorerMove(chess, move);
		if (!applied) break;
	}

	const tags = buildMergedPgnTags(params.headers ?? null, params.pgnTags ?? null);

	// The exported line is a snapshot up to the current cursor, not necessarily the full original game.
	tags.Result = '*';

	if (shouldIncludeSetUpFen(params.source, effectiveRootFen)) {
		tags.SetUp = '1';
		tags.FEN = effectiveRootFen;
	} else {
		delete tags.SetUp;
		delete tags.FEN;
	}

	for (const [key, value] of toOrderedTagEntries(tags)) {
		chess.setHeader(key, value);
	}

	return chess.pgn().trim();
}

function createChessFromFenOrInitial(fen: string): Chess {
	try {
		return new Chess(fen);
	} catch {
		return new Chess();
	}
}

function tryApplyExplorerMove(chess: Chess, move: ExplorerMove): boolean {
	try {
		chess.move({
			from: move.from,
			to: move.to,
			promotion: move.promotion,
		});
		return true;
	} catch {
		const san = cleanText(move.san);
		if (!san) return false;

		try {
			chess.move(san);
			return true;
		} catch {
			return false;
		}
	}
}

function shouldIncludeSetUpFen(source: ExplorerSessionSource, rootFen: string): boolean {
	if (source.kind === 'FEN') return true;
	return rootFen !== STANDARD_START_FEN;
}

function buildMergedPgnTags(headers: ExplorerGameHeaders | null, pgnTags: PgnTags | null): PgnTags {
	return {
		...buildPgnTagsFromHeaders(headers),
		...normalizePgnTags(pgnTags),
	};
}

function buildPgnTagsFromHeaders(headers: ExplorerGameHeaders | null): PgnTags {
	if (!headers) return {};

	const tags: PgnTags = {};

	setTag(tags, 'Event', headers.event);
	setTag(tags, 'Site', headers.site ?? headers.siteUrl);
	setTag(tags, 'Date', toPgnDate(headers.playedAtIso));
	setTag(tags, 'Round', headers.round);

	setTag(tags, 'White', headers.white);
	setTag(tags, 'Black', headers.black);

	setTag(tags, 'WhiteElo', headers.whiteElo);
	setTag(tags, 'BlackElo', headers.blackElo);

	setTag(tags, 'ECO', headers.eco ?? headers.ecoDetermined);
	setTag(tags, 'Opening', headers.opening ?? headers.ecoOpeningName);
	setTag(tags, 'Variant', headers.variant);
	setTag(tags, 'TimeControl', resolveTimeControl(headers));

	return tags;
}

function normalizePgnTags(tags: PgnTags | null): PgnTags {
	if (!tags) return {};

	const normalized: PgnTags = {};

	for (const [key, value] of Object.entries(tags)) {
		const cleanedKey = cleanText(key);
		const cleanedValue = cleanText(value);
		if (!cleanedKey || !cleanedValue) continue;

		normalized[cleanedKey] = cleanedValue;
	}

	return normalized;
}

function resolveTimeControl(headers: ExplorerGameHeaders): string | undefined {
	const explicit = cleanText(headers.timeControl);
	if (explicit) return explicit;

	const initialSeconds = headers.initialSeconds;
	const incrementSeconds = headers.incrementSeconds;

	if (typeof initialSeconds === 'number' && Number.isFinite(initialSeconds)) {
		if (typeof incrementSeconds === 'number' && Number.isFinite(incrementSeconds)) {
			return `${initialSeconds}+${incrementSeconds}`;
		}

		return `${initialSeconds}`;
	}

	return undefined;
}

function toPgnDate(playedAtIso: string | undefined): string | undefined {
	const iso = cleanText(playedAtIso);
	if (!iso) return undefined;

	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return undefined;

	const year = date.getUTCFullYear().toString().padStart(4, '0');
	const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
	const day = `${date.getUTCDate()}`.padStart(2, '0');

	return `${year}.${month}.${day}`;
}

function setTag(tags: PgnTags, key: string, value: string | undefined): void {
	const cleaned = cleanText(value);
	if (!cleaned) return;
	tags[key] = cleaned;
}

function cleanText(value: string | undefined | null): string | undefined {
	const text = (value ?? '').trim();
	return text.length > 0 ? text : undefined;
}

function toOrderedTagEntries(tags: PgnTags): Array<[string, string]> {
	const entries: Array<[string, string]> = [];
	const seen = new Set<string>();

	for (const key of PRIMARY_TAG_ORDER) {
		const value = cleanText(tags[key]);
		if (!value) continue;

		entries.push([key, value]);
		seen.add(key);
	}

	for (const key of SECONDARY_TAG_ORDER) {
		const value = cleanText(tags[key]);
		if (!value) continue;

		entries.push([key, value]);
		seen.add(key);
	}

	const remainingKeys = Object.keys(tags)
		.filter((key) => !seen.has(key))
		.sort((a, b) => a.localeCompare(b));

	for (const key of remainingKeys) {
		const value = cleanText(tags[key]);
		if (!value) continue;

		entries.push([key, value]);
	}

	return entries;
}
