/**
 * Explorer domain types (CORE)
 *
 * Public type surface for the Explorer feature.
 *
 * Goals:
 * - Keep UI/Electron code independent from chess rules and internal modeling.
 * - UI sends intents (move attempts, load requests, navigation).
 * - Core returns explicit results and typed errors (ok/error unions).
 *
 * Notes:
 * - All comments must be in English.
 * - Keep these types stable: they are the contract of the Explorer module.
 */

export type ExplorerMode = 'CASE1_FREE' | 'CASE2_DB' | 'CASE2_PGN';

/**
 * Promotion piece codes follow UCI conventions:
 * - q = queen, r = rook, b = bishop, n = knight
 */
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type ExplorerMoveAttempt = {
	/** Origin square in algebraic coordinates (e.g. "e2"). */
	from: string;

	/** Destination square in algebraic coordinates (e.g. "e4"). */
	to: string;

	/** Required for pawn promotions. */
	promotion?: PromotionPiece;
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

	/** Position after the move (FEN). */
	fen: string;

	/** Move notation (SAN). */
	san: string;

	/** Move notation (UCI). Example: "e2e4", "e7e8q". */
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
 * For non-promotion errors, details are intentionally left as unknown.
 * This keeps the API flexible while still supporting safe narrowing by code.
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
 * This keeps integration explicit and predictable.
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
 * Describes how the current session was created.
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
 * Intentionally minimal.
 * Can be extended later (headers, players, dates, etc.).
 */
export type ExplorerPgnMeta = {
	name?: string;
};

/**
 * Database-loaded game metadata (CORE)
 *
 * Legacy payload used by loadGameMovesSan().
 * New code should prefer ExplorerGameSnapshot.
 */
export type ExplorerDbGameMeta = {
	gameId: string;
	name?: string;
};

/**
 * Explorer game snapshot (CORE)
 *
 * A single, versioned DTO representing everything the Explorer needs to start a DB-backed session
 * and feed current/future UI components.
 *
 * Design constraints:
 * - Storage-agnostic: DB schema may evolve.
 * - Contract should remain stable (only additive changes).
 */
export type ExplorerGameSnapshot = ExplorerGameSnapshotV1;

export type ExplorerGameSnapshotV1 = {
	/** Contract version for safe evolution. */
	schemaVersion: 1;

	/** Snapshot kind (reserved for future extensions). */
	kind: 'DB';

	/** Primary DB identifier. */
	gameId: string;

	/** Minimal structured headers used by UI now and later. */
	headers: ExplorerGameHeaders;

	/**
	 * Owner perspective color (DB-only).
	 * When present, the UI may use it to orient the board with the owner at the bottom.
	 */
	myColor?: 'white' | 'black';

	/**
	 * Optional raw PGN tags (if available).
	 * Useful for future UI without forcing schema changes.
	 */
	pgnTags?: Record<string, string>;

	/** Mainline moves in SAN (variations are handled in-session, not loaded here). */
	movesSan: string[];

	/**
	 * Optional analysis payload.
	 * Can be computed server-side during import or later by an engine (e.g. Stockfish).
	 */
	analysis?: ExplorerGameAnalysisV1;

	/** Optional import metadata (external source info, timestamps, etc.). */
	importMeta?: ExplorerGameImportMeta;
};

export type ExplorerGameHeaders = {
	event?: string;
	site?: string;
	date?: string;
	round?: string;

	white?: string;
	black?: string;
	result?: '1-0' | '0-1' | '1/2-1/2' | '*';

	eco?: string;
	opening?: string;

	whiteElo?: string;
	blackElo?: string;
};

export type ExplorerGameImportMeta = {
	site?: 'CHESSCOM' | 'LICHESS';
	externalGameId?: string;

	/** ISO-8601 timestamp (string) produced by the server/importer. */
	importedAt?: string;
};

export type ExplorerGameAnalysisV1 = {
	version: 1;

	/**
	 * Analysis indexed by ply (0-based or 1-based is up to the producer),
	 * but must be consistent for a given snapshot.
	 */
	byPly?: Array<{
		ply: number;

		/** Centipawn evaluation. Positive = white advantage. */
		evalCp?: number;

		/** Mate in N (sign convention can be decided later). */
		mateIn?: number;

		/** Optional best move suggestion (SAN). */
		bestSan?: string;
	}>;
};
