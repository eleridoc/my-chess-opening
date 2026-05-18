import type { AnalysisEvaluation, AnalysisSettings } from 'my-chess-opening-core';

export interface StockfishUciScore {
	/** Raw UCI centipawn score before perspective normalization. */
	cp: number | null;

	/** Raw UCI mate score before perspective normalization. */
	mate: number | null;
}

export interface StockfishInfoLine {
	/** Search depth reported by the engine. */
	depth: number | null;

	/** MultiPV index. Null means the engine did not include it. */
	multiPv: number | null;

	/** Raw engine score before perspective normalization. */
	score: StockfishUciScore | null;

	/** Principal variation in UCI notation. */
	principalVariationUci: string[];

	/** Original UCI line for diagnostics. */
	rawLine: string;
}

export interface StockfishBestMoveLine {
	/** Best move in UCI notation. Null when Stockfish returns `(none)`. */
	bestMoveUci: string | null;

	/** Optional ponder move in UCI notation. */
	ponderUci: string | null;

	/** Original UCI line for diagnostics. */
	rawLine: string;
}

export interface StockfishEvaluateFenInput {
	/** Full FEN to evaluate. */
	fen: string;

	/** Analysis settings to apply before evaluation. */
	settings: AnalysisSettings;

	/** Optional hard timeout for this evaluation. */
	timeoutMs?: number;
}

export interface StockfishFenEvaluation {
	/** Full FEN evaluated by the engine. */
	fen: string;

	/** Engine display name detected from UCI. */
	engineName: string;

	/** Engine version detected from UCI, when possible. */
	engineVersion: string | null;

	/** Best move in UCI notation. */
	bestMoveUci: string | null;

	/** Evaluation normalized from White's point of view. */
	evaluation: AnalysisEvaluation | null;

	/** Depth reached by Stockfish. */
	depthReached: number | null;

	/** Principal variation in UCI notation. */
	principalVariationUci: string[];

	/** Time spent evaluating this FEN. */
	timeMs: number;

	/** Final raw bestmove line. */
	rawBestMoveLine: string | null;
}
