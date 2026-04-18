/**
 * Normalize a FEN for logical position identity.
 *
 * We intentionally keep only the first 4 FEN fields:
 * - piece placement
 * - side to move
 * - castling rights
 * - en passant target
 *
 * We intentionally ignore:
 * - halfmove clock
 * - fullmove number
 *
 * Why:
 * - Explorer position identity should describe the chess position itself
 * - Move counters should not split equivalent positions for statistics lookup
 */
export function normalizeFenForPositionIdentity(fen: string): string {
	const parts = (fen ?? '').trim().split(/\s+/);

	// chess.js normally returns 6 fields, but keep this defensive.
	if (parts.length >= 4) {
		return parts.slice(0, 4).join(' ');
	}

	return (fen ?? '').trim();
}
