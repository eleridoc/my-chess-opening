import type {
	PieceKind,
	CapturedCounts,
	CapturedBySide,
	CapturedAvailability,
	CapturedPiecesAtCursor,
	MaterialAtCursor,
} from 'my-chess-opening-core/explorer';

/**
 * Explorer "Game Info Header" view-model types (UI)
 *
 * Goal:
 * - Provide a SINGLE VM that represents all "header" information displayed in the left panel:
 *   meta header + players + details (site/result/opening) + captured/material.
 *
 * Design principles:
 * - Prefer raw/structured data over pre-formatted strings (i18n-ready).
 * - Avoid "line1/line2" style fields: components decide how to render.
 * - Keep templates/components dumb: no domain logic in HTML.
 *
 * Note:
 * - For some domains (captured/material), we intentionally reuse the core types directly.
 *   This avoids duplication and prevents UI/core shape drift over time.
 */

export type PlayerSide = 'white' | 'black';

/**
 * Translation-ready key for game speed/time category.
 * Use these keys in templates to map to i18n strings/icons later.
 */
export type GameSpeedKey = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'unknown';

/**
 * Translation-ready key for rated vs casual.
 */
export type GameRatedKey = 'rated' | 'casual' | 'unknown';

/**
 * Normalized result key (translation-ready).
 * Prefer these keys over raw PGN result codes ("1-0", "0-1", "1/2-1/2", "*").
 */
export type GameResultKey = 'white_win' | 'black_win' | 'draw' | 'ongoing' | 'unknown';

/**
 * Semantic tone for styling the result.
 * The facade computes it (it may depend on myColor).
 */
export type GameResultTone = 'normal' | 'good' | 'bad' | 'neutral';

/**
 * Captured pieces types (reused from the core).
 * - PieceKind excludes kings here (p/n/b/r/q).
 * - Counts represent pieces CAPTURED BY a side (not pieces lost).
 */
export type CapturedPieceKind = PieceKind;
export type CapturedCountsVm = CapturedCounts;
export type CapturedBySideVm = CapturedBySide;
export type CapturedAvailabilityKey = CapturedAvailability;

/**
 * Captured pieces payload at the current cursor position (core).
 * UI treats it as read-only.
 */
export type GameInfoCapturedVm = CapturedPiecesAtCursor;

/**
 * Time control representation (UI).
 *
 * - `initialSeconds` / `incrementSeconds` are raw structured values when known.
 * - `text` is an optional normalized display hint (e.g. "15+10").
 * - `raw` keeps the original source string when parsing isn't possible.
 */
export type GameTimeControlVm = {
	initialSeconds?: number;
	incrementSeconds?: number;
	text?: string;
	raw?: string;
};

export type GameInfoMetaVm = {
	/** Time control (raw + optional normalized hint). */
	timeControl?: GameTimeControlVm;

	/** Rated/casual info as a key (i18n-ready). */
	ratedKey?: GameRatedKey;

	/** Speed category as a key (i18n-ready). */
	speedKey?: GameSpeedKey;

	/**
	 * Prefer ISO-8601 when available (e.g. "2013-02-04T22:44:30.652Z").
	 * Keep it raw for now; formatting will be done by a date/i18n layer later.
	 */
	playedAtIso?: string;
};

export type GameInfoPlayerVm = {
	/** Display name (already sanitized/fallback handled by the VM builder). */
	name: string;

	/** Optional ELO (string to preserve original formatting across sources). */
	elo?: string;

	/**
	 * Whether this player represents the local user (DB snapshot only).
	 * When true, UI can display a dedicated badge/icon.
	 */
	isMe?: boolean;
};

export type GameInfoSiteVm = {
	/**
	 * Translation-ready site key when we can infer it.
	 * If not known, keep it as 'unknown' and rely on `label`.
	 */
	siteKey?: 'lichess' | 'chesscom' | 'unknown';

	/** Display label (raw, as provided by the source). */
	label?: string;

	/** External URL (validated/picked by the facade). */
	url?: string;
};

export type GameInfoResultVm = {
	/** Normalized result key (i18n-ready). */
	key: GameResultKey;

	/** Raw result code from source when available (e.g. "1-0", "0-1", "1/2-1/2", "*"). */
	raw?: string;

	/** Styling hint computed by the facade. */
	tone: GameResultTone;
};

export type GameInfoOpeningVm = {
	/** Opening name (raw). */
	name?: string;

	/**
	 * ECO code displayed by the UI.
	 * In DB sessions, the facade may prefer `ecoDetermined` over provider `eco`.
	 */
	eco?: string;

	/**
	 * When true, `eco` comes from app computation (e.g. ecoDetermined),
	 * and differs from the provider `eco`.
	 */
	ecoIsDeduced?: boolean;

	/**
	 * When true, `name` comes from app enrichment (ecoOpeningName),
	 * because the provider opening name was missing.
	 */
	nameIsDeduced?: boolean;

	/**
	 * Provider ECO code (source/import value).
	 * Useful for tooltips when `ecoIsDeduced` is true.
	 */
	providerEco?: string;

	/**
	 * Optional dataset line (with move numbers) used for the deduced opening name.
	 * Useful for tooltips/debug.
	 */
	deducedLinePgn?: string;

	/**
	 * Optional number of plies matched for the deduced opening name.
	 * Useful for diagnostics and confidence display.
	 */
	deducedMatchPly?: number;
};

/**
 * Single VM used by the whole game-info-panel and its sub-components.
 * Components receive this VM + optional "position" (top/bottom) and decide rendering.
 */
export type GameInfoHeaderVm = {
	/**
	 * Board orientation: which side is currently at the bottom of the board.
	 * This controls UI ordering (top/bottom) for player cards.
	 */
	boardOrientation: PlayerSide;

	/**
	 * Local user's color (DB snapshot only).
	 * When undefined, UI should avoid "good/bad" result styling based on perspective.
	 */
	myColor?: PlayerSide;

	/** Meta header fields (time control, rated/casual, speed, playedAtIso). */
	meta: GameInfoMetaVm;

	/** Players keyed by game side (white/black), independent from top/bottom rendering. */
	players: Record<PlayerSide, GameInfoPlayerVm>;

	/** Optional site info (label + url). */
	site?: GameInfoSiteVm;

	/** Optional result info (normalized key + tone). */
	result?: GameInfoResultVm;

	/** Optional opening info (name + ECO + deduction flags). */
	opening?: GameInfoOpeningVm;

	/**
	 * Captured pieces computed at the current cursor position.
	 *
	 * Availability rules:
	 * - PGN / DB: "available"
	 * - FEN: "not_applicable" (no move history)
	 */
	captured?: GameInfoCapturedVm;

	/**
	 * Material state at the current cursor (core).
	 * Used to compute "+X" advantage correctly (promotion-safe).
	 */
	material?: MaterialAtCursor;
};
