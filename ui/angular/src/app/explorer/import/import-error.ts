import type { ExplorerError } from 'my-chess-opening-core/explorer';

export type ImportKind = 'FEN' | 'PGN';

/**
 * Formats a core ExplorerError into a short, actionable message
 * for the Explorer ephemeral import panel.
 *
 * Notes:
 * - Keep messages concise (snackbar-friendly).
 * - Do not throw: this must be safe for UI usage.
 */
export function formatImportError(error: ExplorerError | null, kind?: ImportKind): string | null {
	if (!error) return null;

	switch (error.code) {
		case 'INVALID_FEN':
			return 'Invalid FEN. Paste a full FEN string (6 fields) and try again.';

		case 'INVALID_PGN':
			// Variations support can be introduced later; this message stays generic on purpose.
			return 'Invalid PGN. Paste a valid PGN (headers optional) and try again.';

		case 'RESET_REQUIRED': {
			// Provide a slightly more specific hint when we know the import kind.
			if (kind === 'FEN')
				return 'Reset required before loading a FEN. Reset the explorer and try again.';
			if (kind === 'PGN')
				return 'Reset required before loading a PGN. Reset the explorer and try again.';
			return 'Reset required before import. Reset the explorer and try again.';
		}

		case 'INTERNAL_ERROR':
			// Core may provide a helpful message.
			return error.message?.trim() || 'Internal error while importing.';

		// Not expected for import, but keep a safe fallback.
		case 'ILLEGAL_MOVE':
		case 'PROMOTION_REQUIRED':
		default:
			return error.message?.trim() || 'Import failed.';
	}
}

/**
 * Utility helper used by the UI to detect the specific "reset required" case.
 */
export function isResetRequired(error: ExplorerError | null): boolean {
	return !!error && error.code === 'RESET_REQUIRED';
}
