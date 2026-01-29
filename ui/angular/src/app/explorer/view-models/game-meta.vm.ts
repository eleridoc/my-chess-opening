/**
 * Explorer "Game Meta" view-model types (UI)
 *
 * Purpose:
 * - Keep components dumb: they render a pre-shaped VM.
 * - Keep formatting decisions centralized in the facade / mapping layer.
 *
 * Notes:
 * - No localization yet: labels/values are currently English strings.
 * - Dates should be passed as ISO-8601 strings and formatted later by a dedicated i18n/date library.
 */

export type GameDetailsRowKind = 'site' | 'result' | 'opening';

/**
 * Semantic tone for the result row.
 * The UI can map these tones to colors/styles without re-implementing game logic.
 */
export type GameResultTone = 'normal' | 'good' | 'bad' | 'neutral';

export type GameMetaHeaderVm = {
	/** Material icon name (e.g. "bolt", "timer", "help"). */
	icon: string;

	/**
	 * Main header line (already formatted).
	 * Example: "15+10 • Rated • Rapid"
	 */
	line1: string;

	/**
	 * Secondary header line (date/time).
	 * Prefer ISO-8601 when available (e.g. "2013-02-04T22:44:30.652Z").
	 */
	line2: string;
};

export type GameDetailsRowVm = {
	kind: GameDetailsRowKind;

	/** Left-side label (short). */
	label: string;

	/** Right-side display value. */
	value: string;

	/** Optional external URL (used by kind === 'site'). */
	href?: string;

	/**
	 * Optional tone used only when kind === 'result'.
	 * When absent, UI should render the value using the default styling.
	 */
	tone?: GameResultTone;
};
