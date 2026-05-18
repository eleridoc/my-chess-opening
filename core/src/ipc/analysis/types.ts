/**
 * Analysis / Stockfish IPC contracts.
 *
 * This API is the shared contract between:
 * - Angular UI
 * - Electron preload
 * - Electron main analysis services
 *
 * V1.15 starts with single-game analysis from the Explorer.
 *
 * Notes:
 * - Dates are raw ISO 8601 strings.
 * - Engine evaluations are stored from White's point of view:
 *   - positive centipawn values favor White
 *   - negative centipawn values favor Black
 *   - positive mate values mean White mates in N
 *   - negative mate values mean Black mates in N
 */

/**
 * Current Stockfish engine availability status.
 */
export interface AnalysisEngineStatus {
	/** True when the engine binary can be resolved and used. */
	available: boolean;

	/** Engine display name, for example "Stockfish". */
	engineName: string;

	/** Engine version when detected, otherwise null. */
	engineVersion: string | null;

	/** Absolute executable path resolved by Electron, when available. */
	executablePath: string | null;

	/** Current platform used for binary resolution. */
	platform: NodeJS.Platform;

	/** Human-readable status message for inline UI states. */
	message: string;
}

/**
 * Supported analysis execution modes.
 *
 * - `movetime`: analyze each position for a fixed amount of time
 * - `depth`: analyze each position until a fixed search depth
 */
export type AnalysisMode = 'movetime' | 'depth';

/**
 * Stockfish settings used for game analysis.
 *
 * This represents the active app configuration.
 * A snapshot of these settings must also be stored with each persisted analysis.
 */
export interface AnalysisSettings {
	/** Settings schema version for future migrations. */
	version: number;

	/** Current analysis mode. */
	mode: AnalysisMode;

	/** Fixed time per position, used when mode is `movetime`. */
	movetimeMs: number;

	/** Fixed depth, used when mode is `depth`. */
	depth: number;

	/** Stockfish Threads option. */
	threads: number;

	/** Stockfish Hash option, in MB. */
	hashMb: number;

	/** Stockfish MultiPV option. V1.15 starts with 1. */
	multiPv: number;
}

/**
 * Persisted / running game analysis status.
 */
export type GameAnalysisStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * Expected analysis error codes.
 */
export type AnalysisErrorCode =
	| 'INVALID_INPUT'
	| 'ENGINE_NOT_AVAILABLE'
	| 'GAME_NOT_FOUND'
	| 'ANALYSIS_ALREADY_RUNNING'
	| 'ANALYSIS_NOT_RUNNING'
	| 'ANALYSIS_CANCELLED'
	| 'ENGINE_ERROR'
	| 'DATABASE_ERROR'
	| 'UNEXPECTED_ERROR';

/**
 * Structured analysis error for UI states.
 */
export interface AnalysisError {
	code: AnalysisErrorCode;
	message: string;
}

/**
 * Engine score from White's point of view.
 *
 * Exactly one of `cp` or `mate` should be set when an evaluation is available.
 */
export interface AnalysisEvaluation {
	/** Centipawn score from White's point of view. */
	cp: number | null;

	/** Mate score from White's point of view. */
	mate: number | null;
}

/**
 * Input used to start or refresh a game analysis.
 */
export interface AnalyzeGameInput {
	/** Internal database game id. */
	gameId: string;

	/**
	 * Force a new analysis even if a previous compatible result exists.
	 *
	 * V1.15 can start with a simple behavior:
	 * - false: reuse latest completed analysis when possible
	 * - true: create a new analysis
	 */
	force?: boolean;
}

/**
 * Input used to load the latest analysis for a game.
 */
export interface GetGameAnalysisInput {
	/** Internal database game id. */
	gameId: string;
}

/**
 * One analyzed move row.
 *
 * This shape is intentionally close to the future Explorer Analysis tab needs:
 * - move table
 * - evaluation curve
 * - future game report classification
 */
export interface GameMoveAnalysisRow {
	/** Internal analysis move row id. */
	id: string;

	/** Internal database game id. */
	gameId: string;

	/** Parent game analysis id. */
	gameAnalysisId: string;

	/** Ply index starting at 1. */
	ply: number;

	/** Full move number displayed on the board / move list. */
	moveNumber: number;

	/** Color that played this move. */
	playedBy: 'white' | 'black';

	/** FEN before the played move. */
	fenBefore: string;

	/** FEN after the played move. */
	fenAfter: string;

	/** Played move in SAN notation, for example "Nf3" or "O-O". */
	moveSan: string;

	/** Played move in UCI notation, for example "g1f3" or "e1g1". */
	moveUci: string;

	/** Best move suggested by the engine in UCI notation. */
	bestMoveUci: string | null;

	/** Evaluation before the played move. */
	evalBefore: AnalysisEvaluation | null;

	/** Evaluation after the played move. */
	evalAfter: AnalysisEvaluation | null;

	/** Engine depth reached for this row. */
	depthReached: number | null;

	/** Principal variation in UCI notation. */
	principalVariationUci: string[];

	/** Time spent by the engine for this row, in milliseconds. */
	timeMs: number | null;

	/** ISO 8601 creation date. */
	createdAtIso: string;

	/** ISO 8601 update date. */
	updatedAtIso: string;
}

/**
 * Analysis summary for a game.
 */
export interface GameAnalysisSummary {
	/** Internal game analysis id. */
	id: string;

	/** Internal database game id. */
	gameId: string;

	/** Current analysis status. */
	status: GameAnalysisStatus;

	/** Engine display name used for this analysis. */
	engineName: string;

	/** Engine version used for this analysis. */
	engineVersion: string | null;

	/** Settings snapshot used for this analysis. */
	settings: AnalysisSettings;

	/** Total number of plies expected for this game. */
	totalPlies: number;

	/** Number of plies already analyzed. */
	analyzedPlies: number;

	/** ISO 8601 start date, when available. */
	startedAtIso: string | null;

	/** ISO 8601 completion date, when available. */
	completedAtIso: string | null;

	/** ISO 8601 failure date, when available. */
	failedAtIso: string | null;

	/** Error message for failed analyses. */
	errorMessage: string | null;

	/** ISO 8601 creation date. */
	createdAtIso: string;

	/** ISO 8601 update date. */
	updatedAtIso: string;
}

/**
 * Full analysis payload for a game.
 */
export interface GameAnalysisDetails {
	/** Analysis summary. */
	summary: GameAnalysisSummary;

	/** Move-by-move analysis rows. */
	moves: GameMoveAnalysisRow[];
}

/**
 * Result returned after starting an analysis.
 */
export type AnalyzeGameResult =
	| {
			ok: true;
			analysis: GameAnalysisDetails;
	  }
	| {
			ok: false;
			error: AnalysisError;
	  };

/**
 * Result returned when loading the latest game analysis.
 */
export type GetGameAnalysisResult =
	| {
			ok: true;
			analysis: GameAnalysisDetails | null;
	  }
	| {
			ok: false;
			error: AnalysisError;
	  };

/**
 * Result returned when cancelling the current analysis.
 */
export type CancelCurrentAnalysisResult =
	| {
			ok: true;
			cancelled: boolean;
	  }
	| {
			ok: false;
			error: AnalysisError;
	  };

/**
 * Public Analysis domain API exposed over IPC.
 */
export interface AnalysisApi {
	/** Get current Stockfish availability status. */
	getEngineStatus: () => Promise<AnalysisEngineStatus>;

	/** Get active Stockfish analysis settings. */
	getSettings: () => Promise<AnalysisSettings>;

	/** Analyze one database game. */
	analyzeGame: (input: AnalyzeGameInput) => Promise<AnalyzeGameResult>;

	/** Load latest analysis for one database game. */
	getLatestGameAnalysis: (input: GetGameAnalysisInput) => Promise<GetGameAnalysisResult>;

	/** Cancel the currently running analysis, when any. */
	cancelCurrentAnalysis: () => Promise<CancelCurrentAnalysisResult>;
}
