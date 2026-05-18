import type { AnalysisErrorCode } from 'my-chess-opening-core';

export class GameAnalysisServiceError extends Error {
	constructor(
		public readonly code: AnalysisErrorCode,
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = 'GameAnalysisServiceError';
	}
}

export function toGameAnalysisServiceError(error: unknown): GameAnalysisServiceError {
	if (error instanceof GameAnalysisServiceError) {
		return error;
	}

	if (error instanceof Error) {
		return new GameAnalysisServiceError('UNEXPECTED_ERROR', error.message, error);
	}

	return new GameAnalysisServiceError('UNEXPECTED_ERROR', String(error), error);
}
