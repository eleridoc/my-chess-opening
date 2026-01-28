import { Chess, type Square } from 'chess.js';

import type {
	ExplorerError,
	ExplorerErrorCode,
	ExplorerGameSnapshot,
	PromotionPiece,
} from './types';

export function makeError<TCode extends ExplorerErrorCode, TDetails = unknown>(
	code: TCode,
	message: string,
	details?: TDetails,
): ExplorerError<TDetails> & { code: TCode } {
	return { code, message, details };
}

export function buildUci(from: string, to: string, promotion?: PromotionPiece): string {
	return promotion ? `${from}${to}${promotion}` : `${from}${to}`;
}

export function isSquare(value: string): value is Square {
	return /^[a-h][1-8]$/.test(value);
}

export function normalizePromotionPiece(value: unknown): PromotionPiece | undefined {
	if (typeof value !== 'string') return undefined;
	const p = value.toLowerCase();
	return p === 'q' || p === 'r' || p === 'b' || p === 'n' ? p : undefined;
}

/**
 * Returns:
 * - null if (from -> to) is not a legal move
 * - [] if legal and NOT a promotion
 * - ['q','r','b','n'] (or subset) if legal AND promotion is available
 */
export function getPromotionOptions(
	chess: Chess,
	from: Square,
	to: Square,
): PromotionPiece[] | null {
	const moves = chess.moves({ square: from, verbose: true }) as Array<{
		from: string;
		to: string;
		promotion?: string;
		flags?: string;
	}>;

	const candidates = moves.filter((m) => m.from === from && m.to === to);
	if (candidates.length === 0) return null;

	const promoMoves = candidates.filter(
		(m) =>
			typeof m.promotion === 'string' ||
			(typeof m.flags === 'string' && m.flags.includes('p')),
	);

	if (promoMoves.length === 0) return [];

	const options = new Set<PromotionPiece>();
	for (const m of promoMoves) {
		const p = (m.promotion ?? '').toLowerCase();
		if (p === 'q' || p === 'r' || p === 'b' || p === 'n') options.add(p);
	}

	// Fallback: if promotion is detected but pieces are not reported, expose standard options.
	return options.size > 0 ? Array.from(options) : ['q', 'r', 'b', 'n'];
}

/**
 * Normalizes PGN text for chess.js:
 * - normalize newlines
 * - ensure blank line between headers and movetext
 * - ensure trailing newline (some builds parse more reliably)
 */
export function normalizePgnText(pgn: string): string {
	let text = (pgn ?? '').replace(/\r\n/g, '\n').trim();

	if (text.startsWith('[')) {
		const lines = text.split('\n');
		let i = 0;
		while (i < lines.length && lines[i].startsWith('[')) i++;
		if (i < lines.length && lines[i] !== '') lines.splice(i, 0, '');
		text = lines.join('\n');
	}

	return `${text}\n`;
}

/**
 * Tries to load PGN using chess.js, supporting different method names depending on versions.
 */
export function tryLoadPgn(
	chess: Chess,
	pgn: string,
): { ok: true } | { ok: false; reason: string } {
	const anyChess = chess as any;
	const loadFn: unknown = anyChess.loadPgn ?? anyChess.load_pgn;

	if (typeof loadFn !== 'function') {
		return {
			ok: false,
			reason: 'No PGN loader method found (expected loadPgn or load_pgn).',
		};
	}

	try {
		const res = loadFn.call(chess, pgn, { strict: false, newlineChar: '\n' });
		if (typeof res === 'boolean' && res === false) {
			return { ok: false, reason: 'PGN loader returned false.' };
		}
		return { ok: true };
	} catch (e) {
		return { ok: false, reason: e instanceof Error ? e.message : String(e) };
	}
}

export function cloneDbGameSnapshot(snapshot: ExplorerGameSnapshot): ExplorerGameSnapshot {
	return {
		schemaVersion: 1,
		kind: 'DB',
		gameId: snapshot.gameId,
		headers: { ...(snapshot.headers ?? {}) },
		pgnTags: snapshot.pgnTags ? { ...snapshot.pgnTags } : undefined,
		movesSan: Array.isArray(snapshot.movesSan) ? [...snapshot.movesSan] : [],
		analysis: snapshot.analysis
			? {
					version: 1,
					byPly: snapshot.analysis.byPly
						? snapshot.analysis.byPly.map((x) => ({ ...x }))
						: undefined,
				}
			: undefined,
		importMeta: snapshot.importMeta ? { ...snapshot.importMeta } : undefined,
	};
}

export function computePositionIdentity(fen: string): {
	normalizedFen: string;
	positionKey: string;
} {
	const normalizedFen = normalizeFenForPositionIdentity(fen);
	const positionKey = fnv1a64Hex(normalizedFen);
	return { normalizedFen, positionKey };
}

function normalizeFenForPositionIdentity(fen: string): string {
	const parts = (fen ?? '').trim().split(/\s+/);
	// chess.js fen() always returns 6 fields, but keep it defensive.
	if (parts.length >= 4) return parts.slice(0, 4).join(' ');
	return (fen ?? '').trim();
}

/**
 * FNV-1a 64-bit hash, returned as 16-hex lowercase string.
 * Deterministic and cheap; good enough as a stable key for ASCII FEN strings.
 */
function fnv1a64Hex(text: string): string {
	let hash = 14695981039346656037n; // offset basis
	const prime = 1099511628211n;
	const mask = 0xffffffffffffffffn;

	for (let i = 0; i < text.length; i++) {
		hash ^= BigInt(text.charCodeAt(i)); // FEN is ASCII => safe/deterministic
		hash = (hash * prime) & mask;
	}

	return hash.toString(16).padStart(16, '0');
}
