import { Chess, type Move } from 'chess.js';
import { createHash } from 'node:crypto';
import type { ImportedGameMove } from '../types';

function sha256Hex(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

function sanitizeSan(san: string): string {
	// chess.js doesn't like "!" / "?" suffixes (e.g. "Nf3!")
	// Keep "+" and "#" because they are part of SAN.
	return san.replace(/[!?]+$/g, '');
}

function toUci(m: Move): string {
	// promotion is already "q","r","b","n" (lowercase) in chess.js
	return `${m.from}${m.to}${m.promotion ?? ''}`;
}

/**
 * Enrich moves with:
 * - fen AFTER each move (full FEN)
 * - positionHash = sha256(fen)
 * - uci
 *
 * Supports non-standard initial position if headers contain "FEN".
 */
export function enrichMovesWithFenAndHash(params: {
	headers: Record<string, string>;
	moves: ImportedGameMove[];
	debugId: string; // e.g. "LICHESS:JPZ0OVJW"
}): ImportedGameMove[] {
	const { headers, moves, debugId } = params;

	const startFen = headers['FEN'];
	const chess = startFen ? new Chess(startFen) : new Chess();

	const enriched: ImportedGameMove[] = [];

	for (const mv of moves) {
		const san = sanitizeSan(mv.san);

		let applied = chess.move(san, { strict: true });
		if (!applied) applied = chess.move(san, { strict: false });
		if (!applied) {
			throw new Error(
				`[enrichMovesWithFenAndHash] Illegal/unparsed move: ${debugId} ply=${mv.ply} san="${mv.san}"`,
			);
		}

		const fen = chess.fen();
		const positionHash = sha256Hex(fen);

		enriched.push({
			...mv,
			san, // keep sanitized SAN
			uci: toUci(applied),
			fen,
			positionHash,
		});
	}

	return enriched;
}
