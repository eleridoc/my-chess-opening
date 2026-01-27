/**
 * Import domain types.
 *
 * These types represent the normalized output of external game imports (Lichess / Chess.com),
 * before being persisted to the database. They are intentionally "data-first" and include:
 * - Objective snapshot (White/Black info as found in PGN headers)
 * - Owner perspective snapshot (relative to the imported account username)
 * - Optional move list with enrichments (FEN, hashes, etc.)
 */

export enum ExternalSite {
	CHESSCOM = 'CHESSCOM',
	LICHESS = 'LICHESS',
}

/** Speed buckets used across the app/import pipeline. */
export type GameSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical';

/** Side/color representation used in the import pipeline (lowercase). */
export type PlayerColor = 'white' | 'black';

/**
 * Numeric result keys.
 * - `resultKey` is from White's perspective:  1=White win, 0=draw/unknown, -1=Black win
 * - `myResultKey` is from owner's perspective: 1=owner win, 0=draw/unknown, -1=owner loss
 */
export type ResultKey = 1 | 0 | -1;

export type ImportOptions = {
	/** Imported account username (owner). Used to compute owner-perspective fields. */
	username: string;

	/** Import only games since this date (UTC). Null/undefined => full import. */
	since?: Date | null;

	/** If true, import only rated games (default true). */
	ratedOnly?: boolean;

	/** Restrict import to these speeds (default ["bullet","blitz","rapid"]). */
	speeds?: GameSpeed[];

	/** If true, include moves/SAN when available (default true). */
	includeMoves?: boolean;

	/** Dev/test safeguard: stop after N games (limits API usage). */
	maxGames?: number;
};

export type ImportedGamePlayer = {
	color: PlayerColor;
	username: string;

	/** Elo as found in headers/APIs (may be missing). */
	elo?: number;

	/** Rating diff as found in headers/APIs (may be missing). */
	ratingDiff?: number;
};

export type ImportedGameMove = {
	/** 1-based ply index (half-moves). */
	ply: number;

	/** SAN token from PGN parsing. */
	san: string;

	/** Optional UCI form (e2e4, g1f3, e7e8q...). */
	uci?: string;

	/**
	 * Full FEN AFTER the move.
	 * Only present when moves are enriched (includeMoves + enrichment step).
	 */
	fen?: string;

	/** sha256(FEN after) - used for debugging and future indexing. */
	positionHash?: string;

	/** sha256(FEN before). */
	positionHashBefore?: string;

	/** Full FEN BEFORE the move (optional). */
	fenBefore?: string;

	/** Remaining clock (milliseconds) after the move when available. */
	clockMs?: number;
};

export type ImportedGameRaw = {
	// -------------------------------------------------------------------------
	// External identity
	// -------------------------------------------------------------------------
	site: ExternalSite;

	/**
	 * External game identifier.
	 * - Lichess: usually the 8/12-chars game id
	 * - Chess.com: usually the numeric game id (live/daily)
	 */
	externalId: string;

	/**
	 * Optional source URL as found in PGN headers.
	 * This is *not* guaranteed to exist or to be a stable canonical URL.
	 */
	siteUrl?: string;

	// -------------------------------------------------------------------------
	// Time / meta
	// -------------------------------------------------------------------------
	/** UTC date-time the game was played (derived from PGN headers). */
	playedAt: Date;

	rated: boolean;

	/** PGN variant string (e.g. "Standard"). */
	variant: string;

	speed: GameSpeed;

	/**
	 * Raw time control string (e.g. "900+10").
	 * Importers should keep it as-is for display/parsing downstream.
	 */
	timeControl: string;

	/** Parsed initial time (seconds). */
	initialSeconds: number;

	/** Parsed increment (seconds). */
	incrementSeconds: number;

	// -------------------------------------------------------------------------
	// Result / outcome
	// -------------------------------------------------------------------------
	/**
	 * PGN Result header.
	 * Common values: "1-0" | "0-1" | "1/2-1/2" | "*"
	 */
	result: string;

	/**
	 * Numeric result key from White's perspective:
	 *  1 = White win, 0 = draw/unknown, -1 = Black win.
	 */
	resultKey: ResultKey;

	termination?: string;
	eco?: string;
	opening?: string;

	// -------------------------------------------------------------------------
	// Raw content
	// -------------------------------------------------------------------------
	/** Raw PGN as imported. */
	pgn: string;

	/** Players parsed from PGN headers as a tuple: [white, black]. */
	players: [ImportedGamePlayer, ImportedGamePlayer];

	/** Optional enriched moves list. */
	moves?: ImportedGameMove[];

	// -------------------------------------------------------------------------
	// Denormalized objective snapshot (from PGN headers)
	// -------------------------------------------------------------------------
	whiteUsername: string;
	blackUsername: string;
	whiteElo?: number;
	blackElo?: number;
	whiteRatingDiff?: number;
	blackRatingDiff?: number;

	// -------------------------------------------------------------------------
	// Owner perspective (relative to the imported account username)
	// Filled by the "owner perspective" step (e.g. applyOwnerPerspective).
	// -------------------------------------------------------------------------
	myColor?: PlayerColor;
	myUsername?: string;
	opponentUsername?: string;

	myElo?: number;
	opponentElo?: number;

	myRatingDiff?: number;
	opponentRatingDiff?: number;

	/**
	 * Numeric result key from owner's perspective:
	 *  1 = owner win, 0 = draw/unknown, -1 = owner loss.
	 */
	myResultKey?: ResultKey;
};
