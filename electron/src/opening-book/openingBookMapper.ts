import type {
	OpeningBookErrorCode,
	OpeningBookGetMovesInput,
	OpeningBookGetMovesResult,
	OpeningBookGetMovesSuccess,
	OpeningBookMove,
	OpeningBookOpeningInfo,
	OpeningBookOutcomeStats,
	OpeningBookSummary,
} from 'my-chess-opening-core';

import {
	clampLichessOpeningExplorerMaxMoves,
	LichessOpeningExplorerClientError,
} from './lichessOpeningExplorerClient';

import type {
	LichessOpeningExplorerMove,
	LichessOpeningExplorerOpening,
	LichessOpeningExplorerResponse,
} from './lichessOpeningExplorerClient';

/**
 * Map the raw Lichess Opening Explorer response to the stable internal IPC contract.
 */
export function mapLichessOpeningExplorerResponseToOpeningBookResult(
	input: OpeningBookGetMovesInput,
	response: LichessOpeningExplorerResponse,
): OpeningBookGetMovesSuccess {
	const source = input.source;
	const fen = normalizeText(input.fen);
	const maxMoves = clampLichessOpeningExplorerMaxMoves(input.maxMoves);

	return {
		ok: true,
		source,
		fen,
		maxMoves,
		summary: mapSummary(response),
		moves: mapMoves(response.moves),
	};
}

/**
 * Convert expected client/network errors to the public Opening Book error contract.
 */
export function mapLichessOpeningExplorerErrorToOpeningBookResult(
	error: unknown,
): OpeningBookGetMovesResult {
	if (error instanceof LichessOpeningExplorerClientError) {
		return {
			ok: false,
			error: {
				code: mapClientErrorCode(error.code),
				message: error.message,
			},
		};
	}

	return {
		ok: false,
		error: {
			code: 'UNEXPECTED_ERROR',
			message: getErrorMessage(error),
		},
	};
}

function mapSummary(response: LichessOpeningExplorerResponse): OpeningBookSummary {
	return {
		outcomes: buildOutcomeStats(response.white, response.draws, response.black),
		opening: mapOpening(response.opening),
	};
}

function mapMoves(moves: LichessOpeningExplorerMove[] | undefined): OpeningBookMove[] {
	if (!Array.isArray(moves)) {
		return [];
	}

	return moves
		.map(mapMove)
		.filter((move): move is OpeningBookMove => move !== null)
		.sort(compareOpeningBookMoves);
}

function mapMove(move: LichessOpeningExplorerMove): OpeningBookMove | null {
	const uci = normalizeText(move.uci);
	const san = normalizeText(move.san);

	if (uci.length === 0 || san.length === 0) {
		return null;
	}

	return {
		uci,
		san,
		outcomes: buildOutcomeStats(move.white, move.draws, move.black),
		averageRating: normalizeNullableNumber(move.averageRating),
		opening: mapOpening(move.opening),
	};
}

function mapOpening(
	opening: LichessOpeningExplorerOpening | null | undefined,
): OpeningBookOpeningInfo | null {
	if (!opening) {
		return null;
	}

	const eco = normalizeNullableText(opening.eco);
	const name = normalizeNullableText(opening.name);

	if (eco === null && name === null) {
		return null;
	}

	return { eco, name };
}

function buildOutcomeStats(
	whiteValue: unknown,
	drawsValue: unknown,
	blackValue: unknown,
): OpeningBookOutcomeStats {
	const white = normalizeCount(whiteValue);
	const draws = normalizeCount(drawsValue);
	const black = normalizeCount(blackValue);
	const total = white + draws + black;

	return {
		white,
		draws,
		black,
		total,
		whitePercent: computePercent(white, total),
		drawPercent: computePercent(draws, total),
		blackPercent: computePercent(black, total),
	};
}

function normalizeCount(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.trunc(value));
}

function normalizeNullableNumber(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}

	return value;
}

function normalizeText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableText(value: unknown): string | null {
	const normalized = normalizeText(value);
	return normalized.length > 0 ? normalized : null;
}

function computePercent(value: number, total: number): number {
	if (total <= 0) {
		return 0;
	}

	return (value / total) * 100;
}

function mapClientErrorCode(code: string): OpeningBookErrorCode {
	switch (code) {
		case 'INVALID_INPUT':
			return 'INVALID_INPUT';

		case 'NETWORK_ERROR':
			return 'NETWORK_ERROR';

		case 'TIMEOUT':
			return 'TIMEOUT';

		case 'RATE_LIMITED':
			return 'RATE_LIMITED';

		case 'REMOTE_ERROR':
		case 'UNEXPECTED_RESPONSE':
			return 'REMOTE_ERROR';

		default:
			return 'UNEXPECTED_ERROR';
	}
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return 'Unexpected opening book error.';
}

/**
 * Stable fallback sort in case the remote API ever returns unsorted moves.
 */
function compareOpeningBookMoves(a: OpeningBookMove, b: OpeningBookMove): number {
	if (b.outcomes.total !== a.outcomes.total) {
		return b.outcomes.total - a.outcomes.total;
	}

	if (a.san < b.san) {
		return -1;
	}
	if (a.san > b.san) {
		return 1;
	}

	if (a.uci < b.uci) {
		return -1;
	}
	if (a.uci > b.uci) {
		return 1;
	}

	return 0;
}
