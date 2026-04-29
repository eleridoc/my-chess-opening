/**
 * Opening book IPC contracts.
 *
 * This API is dedicated to the Explorer external opening book tab.
 *
 * Design goals:
 * - keep external Lichess Explorer responses behind a stable internal contract
 * - support both public Lichess database and Masters database sources
 * - expose move statistics in a shape close to the existing My next moves UI
 * - keep expected network/API failures explicit for inline UI states
 *
 * Notes:
 * - FEN values are raw chess position strings coming from the Explorer session.
 * - Percentages are numeric values in the range 0..100 (not formatted strings).
 * - White / Draw / Black stats are expressed from the objective game result
 *   perspective (White win / Draw / Black win), matching Lichess Explorer data.
 */

/**
 * External opening book source.
 *
 * - `lichess`: aggregated rated games from the Lichess player database
 * - `masters`: over-the-board / master games database exposed by Lichess
 */
export type OpeningBookSource = 'lichess' | 'masters';

/**
 * Input for loading opening book moves from the current Explorer position.
 */
export interface OpeningBookGetMovesInput {
	/** Opening book source selected by the user. */
	source: OpeningBookSource;

	/** Current full FEN from the Explorer board position. */
	fen: string;

	/**
	 * Maximum number of moves requested from the external book.
	 *
	 * The backend will clamp this value to a safe range before calling the
	 * external API.
	 */
	maxMoves?: number;
}

/**
 * Reusable White / Draw / Black breakdown.
 */
export interface OpeningBookOutcomeStats {
	/** Number of games won by White. */
	white: number;

	/** Number of drawn games. */
	draws: number;

	/** Number of games won by Black. */
	black: number;

	/** Total number of games represented by this breakdown. */
	total: number;

	/** White win percentage in the range 0..100. */
	whitePercent: number;

	/** Draw percentage in the range 0..100. */
	drawPercent: number;

	/** Black win percentage in the range 0..100. */
	blackPercent: number;
}

/**
 * Opening metadata when available from the external book.
 */
export interface OpeningBookOpeningInfo {
	/** ECO code, for example "B12". */
	eco: string | null;

	/** Opening name, for example "Caro-Kann Defense". */
	name: string | null;
}

/**
 * One candidate opening book move displayed in the Explorer tab.
 */
export interface OpeningBookMove {
	/** UCI move used for board arrows, for example "e2e4" or "e7e8q". */
	uci: string;

	/** SAN move displayed in the UI, for example "e4", "Nf3" or "O-O". */
	san: string;

	/** Number of games and result breakdown for this move. */
	outcomes: OpeningBookOutcomeStats;

	/** Average rating returned by the external book, when available. */
	averageRating: number | null;

	/** Opening metadata after this move, when available. */
	opening: OpeningBookOpeningInfo | null;
}

/**
 * Aggregated summary for the current position itself.
 */
export interface OpeningBookSummary {
	/** Number of games and result breakdown for the current position. */
	outcomes: OpeningBookOutcomeStats;

	/** Opening metadata for the current position, when available. */
	opening: OpeningBookOpeningInfo | null;
}

/**
 * Successful opening book result returned by the backend.
 */
export interface OpeningBookGetMovesSuccess {
	ok: true;

	/** Echo of the requested source after backend normalization. */
	source: OpeningBookSource;

	/** Echo of the requested FEN. */
	fen: string;

	/** Maximum number of moves effectively requested after backend clamping. */
	maxMoves: number;

	/** Aggregated stats for the current position. */
	summary: OpeningBookSummary;

	/** Candidate moves sorted by backend/API-defined relevance. */
	moves: OpeningBookMove[];
}

/**
 * Expected opening book failure codes.
 */
export type OpeningBookErrorCode =
	| 'INVALID_INPUT'
	| 'AUTH_REQUIRED'
	| 'NETWORK_ERROR'
	| 'TIMEOUT'
	| 'RATE_LIMITED'
	| 'REMOTE_ERROR'
	| 'UNEXPECTED_ERROR';

/**
 * Structured opening book error for inline UI states.
 */
export interface OpeningBookError {
	code: OpeningBookErrorCode;
	message: string;
}

/**
 * Opening book result.
 *
 * Expected external API failures are returned as `ok: false` instead of forcing
 * every UI consumer to parse thrown errors.
 */
export type OpeningBookGetMovesResult =
	| OpeningBookGetMovesSuccess
	| { ok: false; error: OpeningBookError };

/**
 * Opening book domain API exposed over IPC.
 *
 * This interface will be mounted on `ElectronApi` when the IPC/preload bridge is
 * added in the integration task.
 */
export interface OpeningBookApi {
	/** Load external opening book moves for the current Explorer position. */
	getMoves: (input: OpeningBookGetMovesInput) => Promise<OpeningBookGetMovesResult>;
}
