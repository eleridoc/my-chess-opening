import { Chess, type Move } from 'chess.js';
import { createHash } from 'node:crypto';
import { normalizeFenForPositionIdentity } from '../../explorer/position-identity';
import type { ImportedGameMove } from '../types';

function sha256Hex(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

function sanitizeSan(san: string): string {
	// chess.js can reject SAN suffixes like "!" / "?" (e.g. "Nf3!")
	// We keep "+" and "#" because they are meaningful in SAN.
	return san.replace(/[!?]+$/g, '');
}

function toUci(m: Move): string {
	// promotion is already "q","r","b","n" (lowercase) in chess.js
	return `${m.from}${m.to}${m.promotion ?? ''}`;
}

/**
 * Enrich moves with:
 * - positionHashBefore: sha256(normalized 4-field FEN BEFORE the move)
 * - fen (AFTER): full FEN AFTER the move
 * - positionHash (AFTER): sha256(normalized 4-field FEN AFTER the move)
 * - uci: stable move identifier (e2e4, g1f3, e7e8q...)
 *
 * Why we store BEFORE + AFTER:
 * - The UI shows a logical position identity based on 4 FEN fields.
 * - My-next-moves must query moves from that logical position.
 * - We still keep the full FEN values for board restoration and debugging.
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
		// BEFORE (position from which this move is played)
		const fenBefore = chess.fen();
		const positionHashBefore = sha256Hex(normalizeFenForPositionIdentity(fenBefore));

		const san = sanitizeSan(mv.san);

		// Apply move: try strict SAN parsing first, then fallback to a more permissive mode.
		let applied = chess.move(san, { strict: true });
		if (!applied) applied = chess.move(san, { strict: false });

		if (!applied) {
			throw new Error(
				`[enrichMovesWithFenAndHash] Illegal/unparsed move: ${debugId} ply=${mv.ply} san="${mv.san}"`,
			);
		}

		// AFTER (resulting position after the move)
		const fenAfter = chess.fen();
		const positionHashAfter = sha256Hex(normalizeFenForPositionIdentity(fenAfter));

		enriched.push({
			...mv,
			san, // keep sanitized SAN
			uci: toUci(applied),

			// AFTER (what you show on the board after playing the move)
			fen: fenAfter,
			positionHash: positionHashAfter,

			// BEFORE (what you use to query "next moves" from a displayed position)
			positionHashBefore,
			fenBefore,
			clockMs: mv.clockMs,
		});
	}

	return enriched;
}
