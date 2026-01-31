/**
 * Explorer "Game Info Header" view-model types (UI)
 *
 * Goal:
 * - Provide a SINGLE VM that represents all "header" information displayed in the left panel:
 *   meta header + players + details (site/result/opening).
 *
 * Design principles:
 * - Prefer raw/structured data over pre-formatted strings (i18n-ready).
 * - Avoid "line1/line2" style fields: components decide how to render.
 * - Keep templates/components dumb: no domain logic in HTML.
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
 * - Prefer these keys over raw PGN result codes ("1-0", "0-1", "1/2-1/2", "*").
 */
export type GameResultKey = 'white_win' | 'black_win' | 'draw' | 'ongoing' | 'unknown';

/**
 * Semantic tone for styling the result.
 * The facade computes it (it may depend on myColor).
 */
export type GameResultTone = 'normal' | 'good' | 'bad' | 'neutral';

/**
 * Time control representation.
 * - `initialSeconds` / `incrementSeconds` are the "raw" structured values when known.
 * - `text` is an optional normalized display hint (e.g. "15+10").
 * - `raw` can keep the original source string when parsing isn't possible.
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

	/** ECO code (raw). */
	eco?: string;
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

	/** Optional opening info (name + ECO). */
	opening?: GameInfoOpeningVm;
};
