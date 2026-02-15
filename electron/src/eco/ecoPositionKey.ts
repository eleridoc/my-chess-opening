import { Chess } from 'chess.js';

/**
 * Compute a stable "position key" from a FEN, ignoring clocks.
 * We keep only the first 4 fields:
 * - piece placement
 * - active color
 * - castling rights
 * - en-passant square
 */
export function fenToPositionKey(fen: string): string | null {
	const parts = fen.trim().split(/\s+/g);
	if (parts.length < 4) return null;

	const board = parts[0];
	const turn = parts[1];
	const castling = parts[2] || '-';
	const ep = parts[3] || '-';

	return `${board} ${turn} ${castling} ${ep}`;
}

/**
 * Builds a map of positionKey -> plyIndexReached (1-based ply count),
 * for the positions reached by replaying SAN moves from the initial position.
 *
 * Notes:
 * - Best-effort: if a move cannot be applied, we stop and return what we have.
 * - maxPlies caps work for performance (we don't need to go deep for openings).
 */
export function buildGamePositionKeyMap(
	gameMovesSan: string[],
	maxPlies: number,
): Map<string, number> {
	const chess = new Chess();
	const out = new Map<string, number>();

	const limit = Math.min(gameMovesSan.length, Math.max(0, maxPlies));

	for (let i = 0; i < limit; i++) {
		const san = gameMovesSan[i];

		let res: any;
		try {
			// "strict: false" keeps this tolerant across SAN variants.
			res = chess.move(san, { strict: false } as any);
		} catch {
			res = null;
		}

		if (!res) break;

		const key = fenToPositionKey(chess.fen());
		if (!key) continue;

		// Store the first time we reach this key (smallest ply index).
		// We only need membership checks for matching.
		if (!out.has(key)) out.set(key, i + 1);
	}

	return out;
}
