import type { SharedGameFilter } from '../../filters';
import type { GameSpeed, PlayerColor, ResultKey } from '../../import/types';

/**
 * Export IPC contracts.
 *
 * This API is dedicated to the Export screen and intentionally stays separate
 * from the generic paginated Games list API.
 *
 * Design goals:
 * - accept the shared reusable game filter as input
 * - return the canonical filter actually applied by the backend
 * - expose a lightweight summary endpoint and a PGN file generation endpoint
 */

/**
 * Input for computing the export summary from the current filter state.
 */
export interface ExportSummaryInput {
	/**
	 * Current shared game filter snapshot coming from the UI.
	 *
	 * The backend is responsible for:
	 * - normalizing it
	 * - stripping hidden fields for the export context
	 * - applying the actual query rules
	 */
	filter: SharedGameFilter;
}

/**
 * Aggregated summary counts for the export screen.
 *
 * All result and color counts are from the imported account owner's
 * perspective where applicable.
 */
export interface ExportSummaryStats {
	/** Total number of games matching the export filter. */
	totalGames: number;

	/** Owner wins (`myResultKey = 1`). */
	wins: number;

	/** Owner draws (`myResultKey = 0`). */
	draws: number;

	/** Owner losses (`myResultKey = -1`). */
	losses: number;

	/** Games where the owner played White (`myColor = 'white'`). */
	whiteGames: number;

	/** Games where the owner played Black (`myColor = 'black'`). */
	blackGames: number;

	/** Games with speed = bullet. */
	bulletGames: number;

	/** Games with speed = blitz. */
	blitzGames: number;

	/** Games with speed = rapid. */
	rapidGames: number;
}

/**
 * Summary result returned by the backend.
 *
 * `appliedFilter` is the canonical export filter snapshot actually used to
 * produce the summary. The UI should keep it as the authoritative
 * "last executed filter" for the current summary/export session.
 */
export interface ExportSummaryResult {
	appliedFilter: SharedGameFilter;
	stats: ExportSummaryStats;
}

/**
 * Input for generating a PGN export file.
 *
 * The UI should pass the exact filter snapshot that produced the current
 * summary, not the potentially modified live filter state.
 */
export interface ExportBuildPgnInput {
	filter: SharedGameFilter;
}

/**
 * Result returned when building the PGN export file.
 *
 * The UI is responsible for turning `content` into a Blob and triggering
 * the browser download.
 */
export interface ExportBuildPgnResult {
	/**
	 * Canonical export filter snapshot actually used to generate the file.
	 *
	 * This mirrors `ExportSummaryResult.appliedFilter` so the UI can keep a
	 * single source of truth for the executed filter state.
	 */
	appliedFilter: SharedGameFilter;

	/** Suggested file name for the generated download. */
	fileName: string;

	/** MIME type to use when creating the Blob in the renderer. */
	mimeType: 'application/x-chess-pgn';

	/** Full PGN file content (multi-PGN export). */
	content: string;

	/** Number of exported games included in `content`. */
	gamesCount: number;
}

/**
 * Export domain API exposed over IPC.
 */
export interface ExportApi {
	/**
	 * Compute an aggregated summary for the current export filter.
	 */
	getSummary: (input: ExportSummaryInput) => Promise<ExportSummaryResult>;

	/**
	 * Build the downloadable PGN export file for the provided executed filter.
	 */
	buildPgnFile: (input: ExportBuildPgnInput) => Promise<ExportBuildPgnResult>;
}
