import type { SharedGameFilter } from '../../filters';

/**
 * My next moves IPC contracts.
 *
 * This API is dedicated to the Explorer "Movements played" panel.
 *
 * Design goals:
 * - use the current Explorer position as the query anchor
 * - reuse the shared V1.7 game filter as input
 * - return a canonical filter snapshot actually applied by the backend
 * - expose both:
 *   - the aggregated stats for the current position
 *   - the aggregated stats for each candidate next move
 *
 * Notes:
 * - Counts are based on distinct games.
 * - Dates are always raw ISO 8601 strings.
 * - Percentages are numeric values in the range 0..100 (not formatted strings).
 * - White / Draw / Black stats are expressed from the objective game result
 *   perspective (White win / Draw / Black win), which keeps the UI labels stable.
 */

/**
 * Input for computing next-move statistics from the current position.
 */
export interface MyNextMovesInput {
	/**
	 * Stable Explorer-local position key of the current node.
	 *
	 * Notes:
	 * - This key is useful for UI/debug purposes.
	 * - The backend does not use it as the primary DB lookup anchor for
	 *   my-next-moves.
	 */
	positionKey: string;

	/**
	 * Current shared game filter snapshot coming from the UI.
	 *
	 * The backend is responsible for:
	 * - normalizing it
	 * - stripping hidden fields for the "my-next-moves" context
	 * - applying the actual query rules
	 */
	filter: SharedGameFilter;

	/**
	 * Normalized 4-field FEN of the current Explorer position.
	 *
	 * This value is the authoritative backend lookup anchor for my-next-moves.
	 * The backend derives the persisted DB lookup hash from this normalized FEN.
	 */
	normalizedFen?: string | null;
}

/**
 * Reusable result breakdown for White / Draw / Black.
 *
 * Values are always computed on distinct games and can be used both for:
 * - one candidate next move
 * - the current position summary row
 */
export interface MyNextMovesOutcomeStats {
	/** Number of games won by White. */
	whiteWinsCount: number;

	/** Number of drawn games. */
	drawsCount: number;

	/** Number of games won by Black. */
	blackWinsCount: number;

	/** White win percentage in the range 0..100. */
	whiteWinsPercent: number;

	/** Draw percentage in the range 0..100. */
	drawsPercent: number;

	/** Black win percentage in the range 0..100. */
	blackWinsPercent: number;
}

/**
 * One candidate next-move row displayed in the Explorer panel.
 */
export interface MyNextMoveRow {
	/**
	 * SAN move displayed in the UI (example: "c4", "Nf3", "exd5", "O-O").
	 */
	moveSan: string;

	/**
	 * UCI move kept for future integrations such as colored arrows.
	 */
	moveUci: string;

	/**
	 * Number of distinct games that went from the current position to this move.
	 */
	gamesCount: number;

	/**
	 * Share of distinct games that went to this move, relative to the current
	 * position summary total.
	 *
	 * Range: 0..100.
	 */
	gamesPercent: number;

	/**
	 * White / Draw / Black breakdown for the games that went to this move.
	 */
	outcomes: MyNextMovesOutcomeStats;

	/**
	 * Last time this move was played in the filtered dataset.
	 *
	 * Null when unknown / unavailable.
	 */
	lastPlayedAtIso: string | null;
}

/**
 * Aggregated summary row for the current position itself.
 *
 * This is the persistent bottom row in the UI and must not be mixed with the
 * candidate next-move rows above.
 */
export interface MyNextMovesPositionSummary {
	/**
	 * Number of distinct games that reached the current position.
	 */
	gamesCount: number;

	/**
	 * Percentage value for the current position summary row.
	 *
	 * Expected values:
	 * - 100 when at least one game reached the position
	 * - 0 when no game matched the current position + filter combination
	 */
	gamesPercent: number;

	/**
	 * White / Draw / Black breakdown for all games that reached the position.
	 */
	outcomes: MyNextMovesOutcomeStats;

	/**
	 * Last time the current position was reached in the filtered dataset.
	 *
	 * Null when unknown / unavailable.
	 */
	lastPlayedAtIso: string | null;
}

/**
 * Result returned by the backend for the current Explorer position.
 *
 * `appliedFilter` is the canonical "my-next-moves" filter snapshot actually
 * used by the backend. The UI should keep it as the authoritative filter state
 * for the currently displayed result.
 */
export interface MyNextMovesResult {
	/** Canonical filter snapshot actually applied by the backend. */
	appliedFilter: SharedGameFilter;

	/** Echo of the position key used to compute the result. */
	positionKey: string;

	/** Echo of the normalized FEN when available. */
	normalizedFen: string | null;

	/**
	 * Aggregated summary row for the current position.
	 */
	positionSummary: MyNextMovesPositionSummary;

	/**
	 * Candidate next moves sorted by popularity (backend-defined order).
	 */
	moves: MyNextMoveRow[];
}

/**
 * My next moves domain API exposed over IPC.
 */
export interface MyNextMovesApi {
	/**
	 * Compute aggregated next-move statistics for the current Explorer position.
	 */
	getMoves: (input: MyNextMovesInput) => Promise<MyNextMovesResult>;
}
