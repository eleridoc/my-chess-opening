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

/**
 * Generic result helpers (CORE)
 *
 * We use ok/error unions instead of throwing exceptions for domain operations.
 * This makes UI/Electron integration easier and keeps error handling explicit.
 */
export type ExplorerOk = { ok: true };

export type ExplorerFail<E extends ExplorerError = ExplorerError> = {
	ok: false;
	error: E;
};

export type ExplorerResult<E extends ExplorerError = ExplorerError> = ExplorerOk | ExplorerFail<E>;

/**
 * Explorer session source (CORE)
 *
 * This describes *how* the current session was created.
 * It is informational and helps UI decide which actions are allowed/visible.
 */
export type ExplorerSessionSource =
	| { kind: 'FREE' }
	| { kind: 'FEN'; fen: string }
	| { kind: 'PGN'; name?: string }
	| { kind: 'DB'; gameId: string };

/**
 * PGN metadata (CORE)
 *
 * This is intentionally minimal for now.
 * We may extend it later with headers, player names, dates, etc.
 */
export type ExplorerPgnMeta = {
	name?: string;
};

/**
 * Database-loaded game metadata (CORE)
 */
export type ExplorerDbGameMeta = {
	gameId: string;
	name?: string;
};
