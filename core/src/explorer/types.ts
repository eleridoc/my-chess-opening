/**
 * Explorer domain types (CORE)
 *
 * This file defines the public type surface for the Explorer feature.
 * The goal is to keep UI/Electron code independent from implementation details:
 * - UI sends "attempts" (from/to/promotion)
 * - Core returns typed errors (illegal move, promotion required, etc.)
 *
 * IMPORTANT:
 * - All comments/logical documentation must be in English.
 * - Keep these types stable: they are the backbone of the Explorer module.
 */

export type ExplorerMode = 'CASE1_FREE' | 'CASE2_DB' | 'CASE2_PGN';

/**
 * Promotion piece codes follow UCI conventions:
 * - q = queen, r = rook, b = bishop, n = knight
 */
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type ExplorerMoveAttempt = {
	from: string; // e.g. "e2"
	to: string; // e.g. "e4"
	promotion?: PromotionPiece; // required for pawn promotions
};

export type ExplorerErrorCode =
	| 'ILLEGAL_MOVE'
	| 'PROMOTION_REQUIRED'
	| 'INVALID_FEN'
	| 'INVALID_PGN'
	| 'RESET_REQUIRED'
	| 'INTERNAL_ERROR';

export type ExplorerError<TDetails = unknown> = {
	code: ExplorerErrorCode;
	message: string;
	details?: TDetails;
};

export type PromotionRequiredDetails = {
	from: string;
	to: string;
	options: PromotionPiece[];
};

export type ExplorerApplyMoveSuccess = {
	ok: true;

	/** New current node id after applying the move (existing or newly created). */
	newNodeId: string;

	/** Position after the move. */
	fen: string;

	/** Move notation (SAN). */
	san: string;

	/** Move notation (UCI). Example: "e2e4", "e7e8q" */
	uci: string;
};

/**
 * Typed error for promotion requirements.
 * Allows UI to safely narrow and access details.options.
 */
export type ExplorerPromotionRequiredError = ExplorerError<PromotionRequiredDetails> & {
	code: 'PROMOTION_REQUIRED';
};

/**
 * For any other error code, details are intentionally left as unknown.
 * This keeps the API flexible while still allowing code narrowing.
 */
export type ExplorerNonPromotionError = ExplorerError & {
	code: Exclude<ExplorerErrorCode, 'PROMOTION_REQUIRED'>;
};

export type ExplorerApplyMoveFailure = {
	ok: false;
	error: ExplorerPromotionRequiredError | ExplorerNonPromotionError;
};

export type ExplorerApplyMoveResult = ExplorerApplyMoveSuccess | ExplorerApplyMoveFailure;
