import { ipcMain } from 'electron';

import type {
	OpeningBookGetMovesInput,
	OpeningBookGetMovesResult,
	OpeningBookSource,
} from 'my-chess-opening-core';

import {
	fetchLichessOpeningExplorer,
	LichessOpeningExplorerClientError,
} from './lichessOpeningExplorerClient';

import {
	mapLichessOpeningExplorerErrorToOpeningBookResult,
	mapLichessOpeningExplorerResponseToOpeningBookResult,
} from './openingBookMapper';

/**
 * Register IPC handlers for the Explorer external Opening Book feature.
 *
 * V1.14.4 scope:
 * - expose a first `opening-book:getMoves` endpoint
 * - call the Lichess Opening Explorer client
 * - map the raw external response to the stable internal IPC contract
 * - return structured `ok: false` results for expected failures
 */
export function registerOpeningBookIpc(): void {
	ipcMain.handle(
		'opening-book:getMoves',
		async (_event, input?: OpeningBookGetMovesInput): Promise<OpeningBookGetMovesResult> => {
			try {
				const normalizedInput = normalizeOpeningBookGetMovesInput(input);
				const response = await fetchLichessOpeningExplorer(normalizedInput);

				return mapLichessOpeningExplorerResponseToOpeningBookResult(
					normalizedInput,
					response,
				);
			} catch (error) {
				return mapLichessOpeningExplorerErrorToOpeningBookResult(error);
			}
		},
	);
}

/**
 * Normalize and validate renderer input before any external request is made.
 *
 * The renderer is not trusted as a source of valid data:
 * - source must be one of the supported Opening Book sources
 * - FEN must be a non-empty string
 * - maxMoves is normalized later by the HTTP client
 */
function normalizeOpeningBookGetMovesInput(
	input: OpeningBookGetMovesInput | undefined,
): OpeningBookGetMovesInput {
	if (!input) {
		throw new LichessOpeningExplorerClientError(
			'INVALID_INPUT',
			'Opening book input is required.',
		);
	}

	const source = normalizeOpeningBookSource(input.source);
	const fen = normalizeRequiredText(input.fen, 'FEN');

	return {
		source,
		fen,
		maxMoves: input.maxMoves,
	};
}

function normalizeOpeningBookSource(source: unknown): OpeningBookSource {
	if (source === 'lichess' || source === 'masters') {
		return source;
	}

	throw new LichessOpeningExplorerClientError(
		'INVALID_INPUT',
		`Unsupported opening book source: ${String(source)}`,
	);
}

function normalizeRequiredText(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new LichessOpeningExplorerClientError('INVALID_INPUT', `${label} must be a string.`);
	}

	const normalized = value.trim();

	if (normalized.length === 0) {
		throw new LichessOpeningExplorerClientError('INVALID_INPUT', `${label} is required.`);
	}

	return normalized;
}
